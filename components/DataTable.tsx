'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  FileDown, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  SlidersHorizontal,
  AlertTriangle,
  FileCode2,
  CheckSquare,
  Square,
  MinusSquare,
  ShieldAlert,
  Layers,
  Database,
  Camera,
  History,
  BookOpen,
  FileJson,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AuditSummary, TableClassification, TableMetric, TableAuditItem, AuditSnapshot, DatabaseEngine } from '@/lib/types';
import { generateMarkdownReport, generateCsvReport } from '@/lib/export-helpers';
import { ArchiveScriptModal } from './ArchiveScriptModal';
import { DataDictionaryModal } from './DataDictionaryModal';
import { SnapshotCompareModal } from './SnapshotCompareModal';

interface DataTableProps {
  summary: AuditSummary;
  engine?: DatabaseEngine;
  connectionPayload?: {
    engine?: DatabaseEngine;
    encryptedConnectionString: string;
    algorithm: string;
    secretKey: string;
  } | null;
}

type SortField = 'fullName' | 'totalRows' | 'totalReads' | 'totalWrites' | 'daysSinceLastActivity' | 'totalSizeMb' | 'dependenciesCount';
type SortDirection = 'asc' | 'desc';

export function DataTable({ summary, connectionPayload }: DataTableProps) {
  const [filterTab, setFilterTab] = useState<'all' | TableClassification>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('daysSinceLastActivity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [copied, setCopied] = useState(false);
  const [inactivityThreshold, setInactivityThreshold] = useState<number>(30); // Días sin uso
  
  // Selección múltiple para script DDL y Documentación
  const [selectedTablesMap, setSelectedTablesMap] = useState<Record<string, boolean>>({});
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  // Snapshots Comparativos Locales
  const [loadedSnapshot, setLoadedSnapshot] = useState<AuditSnapshot | null>(null);
  const [isSnapshotCompareModalOpen, setIsSnapshotCompareModalOpen] = useState(false);
  const [persistentZeroIoFilter, setPersistentZeroIoFilter] = useState<Set<string> | null>(null);
  const snapshotFileInputRef = useRef<HTMLInputElement>(null);

  // Debounce de búsqueda de 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Recalcular clasificación dinámica basada en el umbral seleccionado por el usuario
  const classifiedTables = useMemo(() => {
    return summary.tables.map(table => {
      let classification: TableClassification = table.classification;

      if (table.isSystemMetadata) {
        classification = 'metadata';
      } else if (table.totalReads === 0 && table.totalWrites === 0) {
        classification = 'obsolete';
      } else if (table.daysSinceLastActivity !== null && table.daysSinceLastActivity >= inactivityThreshold) {
        classification = 'stale';
      } else if (table.totalWrites === 0) {
        classification = 'readonly';
      } else {
        classification = 'active';
      }

      const isPersistent = persistentZeroIoFilter 
        ? persistentZeroIoFilter.has(table.fullName.toLowerCase()) 
        : false;

      return {
        ...table,
        classification,
        isPersistentZeroIo: isPersistent
      };
    });
  }, [summary.tables, inactivityThreshold, persistentZeroIoFilter]);

  // Contadores reactivos
  const counts = useMemo(() => {
    return {
      all: classifiedTables.length,
      active: classifiedTables.filter(t => t.classification === 'active').length,
      readonly: classifiedTables.filter(t => t.classification === 'readonly').length,
      stale: classifiedTables.filter(t => t.classification === 'stale').length,
      obsolete: classifiedTables.filter(t => t.classification === 'obsolete').length,
      metadata: classifiedTables.filter(t => t.classification === 'metadata').length,
    };
  }, [classifiedTables]);

  // Filtrado y ordenamiento de 700+ tablas
  const filteredTables = useMemo(() => {
    return classifiedTables.filter((table) => {
      // 1. Filtro estricto por Snapshot Comparativo si está activo
      if (persistentZeroIoFilter && !persistentZeroIoFilter.has(table.fullName.toLowerCase())) {
        return false;
      }
      // 2. Filtro por pestaña
      if (filterTab !== 'all' && table.classification !== filterTab) {
        return false;
      }
      // 3. Filtro por búsqueda con debounce
      if (debouncedSearch.trim()) {
        const term = debouncedSearch.toLowerCase();
        return (
          table.fullName.toLowerCase().includes(term) ||
          table.schemaName.toLowerCase().includes(term) ||
          table.tableName.toLowerCase().includes(term)
        );
      }
      return true;
    }).sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (valA === null || valA === undefined) valA = sortField === 'daysSinceLastActivity' ? 999999 : 0;
      if (valB === null || valB === undefined) valB = sortField === 'daysSinceLastActivity' ? 999999 : 0;

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [classifiedTables, filterTab, debouncedSearch, sortField, sortDirection, persistentZeroIoFilter]);

  // Lista de tablas seleccionadas
  const selectedTablesList = useMemo(() => {
    return filteredTables.filter(t => selectedTablesMap[t.fullName]);
  }, [filteredTables, selectedTablesMap]);

  // Tablas objetivo para documentación viva (las seleccionadas, o las activas del tab)
  const tablesForDocumentation = useMemo(() => {
    if (selectedTablesList.length > 0) return selectedTablesList;
    return classifiedTables.filter(t => t.classification === 'active');
  }, [selectedTablesList, classifiedTables]);

  const areAllFilteredSelected = filteredTables.length > 0 && filteredTables.every(t => selectedTablesMap[t.fullName]);
  const isSomeFilteredSelected = filteredTables.some(t => selectedTablesMap[t.fullName]) && !areAllFilteredSelected;

  const toggleSelectAllFiltered = () => {
    if (areAllFilteredSelected) {
      const next = { ...selectedTablesMap };
      filteredTables.forEach(t => { delete next[t.fullName]; });
      setSelectedTablesMap(next);
    } else {
      const next = { ...selectedTablesMap };
      filteredTables.forEach(t => { next[t.fullName] = true; });
      setSelectedTablesMap(next);
    }
  };

  const toggleTableRow = (fullName: string) => {
    setSelectedTablesMap(prev => {
      const next = { ...prev };
      if (next[fullName]) {
        delete next[fullName];
      } else {
        next[fullName] = true;
      }
      return next;
    });
  };

  // Selección rápida de todas las tablas con 0 I/O
  const selectAllObsolete = () => {
    const next: Record<string, boolean> = {};
    classifiedTables.filter(t => t.classification === 'obsolete' || t.classification === 'stale').forEach(t => {
      next[t.fullName] = true;
    });
    setSelectedTablesMap(next);
    setFilterTab('obsolete');
  };

  // Virtualización de lista para 700+ filas
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredTables.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 54,
    overscan: 15,
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    const content = generateMarkdownReport({
      ...summary,
      tables: classifiedTables,
    });
    const filename = `Auditoria_${summary.databaseName}_${new Date().toISOString().slice(0, 10)}.md`;
    downloadFile(content, filename, 'text/markdown;charset=utf-8;');
  };

  const exportCsv = () => {
    const content = generateCsvReport({
      ...summary,
      tables: classifiedTables
    });
    const filename = `Auditoria_${summary.databaseName}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(content, filename, 'text/csv;charset=utf-8;');
  };

  // Guardar Snapshot de Auditoría (.json descargable con metadatos estrictos)
  const handleSaveSnapshot = () => {
    const nowIso = new Date().toISOString();
    const snapshot: AuditSnapshot = {
      version: '1.0',
      metadata: {
        databaseName: summary.databaseName,
        serverInstance: summary.serverInfo.serverName,
        createdAt: nowIso,
        uptimeStartTime: summary.sqlServerStartTime,
        totalTablesCount: classifiedTables.length,
      },
      // Compatibilidad retroactiva
      snapshotDate: nowIso,
      databaseName: summary.databaseName,
      serverName: summary.serverInfo.serverName,
      sqlServerStartTime: summary.sqlServerStartTime,
      tables: classifiedTables.map(t => ({
        fullName: t.fullName,
        schemaName: t.schemaName,
        tableName: t.tableName,
        totalRows: t.totalRows,
        totalSizeMb: t.totalSizeMb,
        totalReads: t.totalReads,
        totalWrites: t.totalWrites,
        lastActivityDate: t.lastActivityDate,
        classification: t.classification,
      })),
    };
    const filename = `Snapshot_${summary.databaseName}_${nowIso.slice(0, 10)}.json`;
    downloadFile(JSON.stringify(snapshot, null, 2), filename, 'application/json;charset=utf-8;');
  };

  // Cargar y Comparar Snapshot
  const handleSnapshotFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.tables || !Array.isArray(parsed.tables)) {
          alert('Archivo de snapshot inválido: debe contener un arreglo de tablas.');
          return;
        }
        setLoadedSnapshot(parsed);
        setIsSnapshotCompareModalOpen(true);
      } catch (err: any) {
        alert(`Error al leer archivo JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const copyExecutiveSummary = () => {
    const text = `AUDITORÍA DE TABLAS: ${summary.databaseName}\n` +
      `Servidor: ${summary.serverInfo.serverName} | Uptime: ${summary.uptimeFormatted}\n` +
      `Total Tablas: ${counts.all} | Umbral Inactividad: >${inactivityThreshold} días\n` +
      `🟢 Activas Recientes: ${counts.active} (${((counts.active/counts.all)*100).toFixed(1)}%)\n` +
      `🟡 Solo Lectura: ${counts.readonly} (${((counts.readonly/counts.all)*100).toFixed(1)}%)\n` +
      `🟠 Estancadas (> ${inactivityThreshold}d sin uso): ${counts.stale} (${((counts.stale/counts.all)*100).toFixed(1)}%)\n` +
      `🔴 0 I/O Total: ${counts.obsolete} (${((counts.obsolete/counts.all)*100).toFixed(1)}%)\n` +
      `⚠️ Tablas con dependencias: ${summary.kpis.tablesWithDependenciesCount}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 inline ml-1 opacity-70" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-400 inline ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-400 inline ml-1" />
    );
  };

  const renderBadge = (table: TableMetric) => {
    if (table.isPersistentZeroIo) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
          0 I/O Confirmada
        </span>
      );
    }

    switch (table.classification) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Activa
          </span>
        );
      case 'readonly':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Solo Lectura
          </span>
        );
      case 'stale':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
            Estancada &gt;{inactivityThreshold}d
          </span>
        );
      case 'obsolete':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            0 I/O Total
          </span>
        );
      case 'metadata':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Metadatos / Migración
          </span>
        );
    }
  };

  const formatActivity = (days: number | null, dateStr: string | null) => {
    if (days === null || !dateStr) {
      return <span className="text-rose-400/80 font-semibold">Nunca</span>;
    }
    const d = new Date(dateStr);
    const dateFormatted = d.toLocaleDateString();

    if (days === 0) {
      return <span className="text-emerald-400 font-semibold">Hoy ({dateFormatted})</span>;
    }
    if (days === 1) {
      return <span className="text-emerald-300">Ayer ({dateFormatted})</span>;
    }
    if (days >= inactivityThreshold) {
      return (
        <span className="text-orange-400 font-medium flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>Hace {days} días</span>
        </span>
      );
    }
    return (
      <span className="text-slate-300">
        Hace {days} días
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      {/* Input de archivo oculto para Snapshots */}
      <input
        type="file"
        ref={snapshotFileInputRef}
        onChange={handleSnapshotFileChange}
        accept=".json"
        className="hidden"
      />

      {/* Modal 1: Generador de Script DDL de Saneamiento Seguro */}
      <ArchiveScriptModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        selectedTables={selectedTablesList}
        databaseName={summary.databaseName}
        connectionPayload={connectionPayload}
      />

      {/* Modal 2: Generador de Documentación de Tablas Vivas (Data Dictionary & Mermaid) */}
      <DataDictionaryModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        selectedTables={tablesForDocumentation}
        databaseName={summary.databaseName}
        connectionPayload={connectionPayload}
      />

      {/* Modal 3: Comparativa de Snapshots Locales */}
      {loadedSnapshot && (
        <SnapshotCompareModal
          isOpen={isSnapshotCompareModalOpen}
          onClose={() => setIsSnapshotCompareModalOpen(false)}
          previousSnapshot={loadedSnapshot}
          currentSummary={{
            ...summary,
            tables: classifiedTables
          }}
          onFilterPersistentZeroIo={(tableNames) => {
            setPersistentZeroIoFilter(new Set(tableNames.map(n => n.toLowerCase())));
          }}
        />
      )}

      {/* Barra de Filtro de Recencia / Antigüedad */}
      <div className="px-5 py-3.5 bg-slate-950/70 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <SlidersHorizontal className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-semibold text-white">Criterio de Recencia (Días sin actividad):</span>
          <span className="text-slate-400">Marcar como estancada si no registra I/O hace más de</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl p-1">
          {[15, 30, 60, 90, 180].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setInactivityThreshold(days)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                inactivityThreshold === days
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {days} días
            </button>
          ))}
        </div>
      </div>

      {/* Barra de Alerta si hay filtro de Snapshot activo */}
      {persistentZeroIoFilter && (
        <div className="px-5 py-2.5 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              Filtro de Comparativa Activo: Mostrando únicamente las <strong>{persistentZeroIoFilter.size} tablas</strong> con 0 I/O persistente en ambos snapshots.
            </span>
          </div>
          <button
            onClick={() => setPersistentZeroIoFilter(null)}
            className="flex items-center gap-1 text-xs text-rose-200 hover:text-white underline underline-offset-2"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Quitar filtro</span>
          </button>
        </div>
      )}

      {/* Barra de Acciones y Pestañas */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col 2xl:flex-row items-stretch 2xl:items-center justify-between gap-4">
        {/* Pestañas de Filtro Rápido - Con flex-wrap y no-scrollbar sin barra nativa gris */}
        <div className="flex flex-wrap items-center gap-1.5 no-scrollbar">
          <button
            onClick={() => { setFilterTab('all'); setPersistentZeroIoFilter(null); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
              filterTab === 'all' && !persistentZeroIoFilter
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Todas ({counts.all})
          </button>
          <button
            onClick={() => { setFilterTab('active'); setPersistentZeroIoFilter(null); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
              filterTab === 'active'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/60'
            }`}
          >
            🟢 Activas ({counts.active})
          </button>
          <button
            onClick={() => { setFilterTab('readonly'); setPersistentZeroIoFilter(null); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
              filterTab === 'readonly'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800/60'
            }`}
          >
            🟡 Solo Lectura ({counts.readonly})
          </button>
          <button
            onClick={() => { setFilterTab('stale'); setPersistentZeroIoFilter(null); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
              filterTab === 'stale'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-500/20'
                : 'text-slate-400 hover:text-orange-400 hover:bg-slate-800/60'
            }`}
          >
            🟠 Estancadas &gt;{inactivityThreshold}d ({counts.stale})
          </button>
          <button
            onClick={() => { setFilterTab('obsolete'); setPersistentZeroIoFilter(null); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
              filterTab === 'obsolete'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800/60'
            }`}
          >
            🔴 0 I/O Total ({counts.obsolete})
          </button>
        </div>

        {/* Botones de Acción DBA: Script DDL, Documentación y Snapshots */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botón 1: Generar Script DDL */}
          <button
            onClick={() => setIsArchiveModalOpen(true)}
            disabled={selectedTablesList.length === 0}
            className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Generar script ALTER SCHEMA con manejo de FKs"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Generar Script ({selectedTablesList.length})</span>
          </button>

          {/* Botón 2: Documentación de Tablas Vivas (Data Dictionary & Mermaid) */}
          <button
            onClick={() => setIsDocModalOpen(true)}
            disabled={tablesForDocumentation.length === 0}
            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-40"
            title="Exportar Diccionario de Datos Markdown y Diagrama Mermaid ERD"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Documentar Vivas ({tablesForDocumentation.length})</span>
          </button>

          {/* Botón 3: Guardar Snapshot */}
          <button
            onClick={handleSaveSnapshot}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
            title="Descargar snapshot JSON del estado actual de tablas"
          >
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            <span>Guardar Snapshot</span>
          </button>

          {/* Botón 4: Comparar Snapshot */}
          <button
            onClick={() => snapshotFileInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
            title="Cargar un snapshot JSON previo para comparar deltas de inactividad"
          >
            <History className="w-3.5 h-3.5 text-purple-400" />
            <span>Comparar Snapshot</span>
          </button>

          {/* Botones de Exportación Rápida */}
          <div className="h-4 w-px bg-slate-800 hidden sm:block mx-1" />

          <button
            onClick={copyExecutiveSummary}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 rounded-xl text-xs font-medium transition flex items-center gap-1"
            title="Copiar resumen al portapapeles"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Resumen'}</span>
          </button>

          <button
            onClick={exportMarkdown}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1"
            title="Descargar reporte completo en Markdown"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>.md</span>
          </button>

          <button
            onClick={exportCsv}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1"
            title="Descargar reporte en CSV para Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>.csv</span>
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda con Debounce y Selección Rápida */}
      <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por tabla o esquema (ej: sales., tmp_)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>

          <button
            type="button"
            onClick={selectAllObsolete}
            className="text-indigo-400 hover:text-indigo-300 text-xs font-medium whitespace-nowrap underline underline-offset-4"
          >
            Seleccionar todas en desuso
          </button>
        </div>

        <div className="flex items-center gap-3 text-slate-400 text-xs w-full sm:w-auto justify-between sm:justify-end">
          <span>
            {selectedTablesList.length > 0 ? (
              <span className="text-indigo-300 font-semibold">{selectedTablesList.length} seleccionadas</span>
            ) : (
              <span>Mostrando {filteredTables.length} tablas</span>
            )}
          </span>
          <span className="text-[11px] bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/50">
            Virtualización 60 FPS
          </span>
        </div>
      </div>

      {/* Contenedor Horizontal Amplio de la Tabla con Scrollbar Oscuro */}
      <div className="overflow-x-auto custom-scrollbar w-full">
        <div className="min-w-[1200px] w-full">
          {/* Encabezado Fijo de Columnas */}
          <div className="bg-slate-950/90 border-b border-slate-800 text-slate-400 text-xs font-semibold select-none flex items-center px-4 py-3">
            <div className="w-12 shrink-0">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="text-slate-400 hover:text-white"
              >
                {areAllFilteredSelected ? (
                  <CheckSquare className="w-4 h-4 text-indigo-400" />
                ) : isSomeFilteredSelected ? (
                  <MinusSquare className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </div>

            <div className="flex-1 min-w-[280px] cursor-pointer hover:text-slate-200" onClick={() => handleSort('fullName')}>
              Tabla y Esquema {renderSortIcon('fullName')}
            </div>

            <div className="w-40 shrink-0 text-center">Estado Diagnóstico</div>

            <div className="w-40 shrink-0 text-center cursor-pointer hover:text-slate-200" onClick={() => handleSort('dependenciesCount')}>
              Dependencias {renderSortIcon('dependenciesCount')}
            </div>

            <div className="w-44 shrink-0 cursor-pointer hover:text-slate-200" onClick={() => handleSort('daysSinceLastActivity')}>
              Última Actividad {renderSortIcon('daysSinceLastActivity')}
            </div>

            <div className="w-32 shrink-0 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('totalRows')}>
              Filas {renderSortIcon('totalRows')}
            </div>

            <div className="w-32 shrink-0 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('totalSizeMb')}>
              Tamaño (MB) {renderSortIcon('totalSizeMb')}
            </div>

            <div className="w-32 shrink-0 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('totalReads')}>
              Lecturas {renderSortIcon('totalReads')}
            </div>

            <div className="w-28 shrink-0 text-right cursor-pointer hover:text-slate-200 pr-4" onClick={() => handleSort('totalWrites')}>
              Escrituras {renderSortIcon('totalWrites')}
            </div>
          </div>

          {/* Contenedor Virtualizado con @tanstack/react-virtual para 700+ Filas a 60 FPS */}
          <div 
            ref={parentRef}
            className="overflow-y-auto custom-scrollbar h-[600px] relative divide-y divide-slate-800/40 bg-slate-950/20 font-mono text-xs text-slate-300"
          >
            {filteredTables.length === 0 ? (
              <div className="py-20 text-center text-slate-500 font-sans">
                No se encontraron tablas que coincidan con los criterios de búsqueda.
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const table = filteredTables[virtualRow.index];
                  const isSelected = !!selectedTablesMap[table.fullName];

                  return (
                    <div
                      key={table.fullName}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`flex items-center px-4 hover:bg-slate-800/40 transition border-b border-slate-800/40 ${
                        isSelected ? 'bg-indigo-950/30' : ''
                      }`}
                    >
                      {/* Checkbox de Selección */}
                      <div className="w-12 shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTableRow(table.fullName)}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>

                      {/* Nombre y Esquema */}
                      <div className="flex-1 min-w-[280px] font-sans font-medium text-slate-200 truncate">
                        <span className="text-slate-500">{table.schemaName}.</span>
                        <span className="text-white font-semibold">{table.tableName}</span>
                        {table.totalRows === 0 && (
                          <span className="ml-2 text-[10px] text-slate-500 bg-slate-800/70 px-1.5 py-0.5 rounded">
                            0 filas
                          </span>
                        )}
                        {table.seekScanRatio === 'SCAN_ONLY' && (
                          <span 
                            className="ml-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded"
                            title="Solo se accede mediante table scans de barrido completo (posible mantenimiento/auditoría sin uso por índices)"
                          >
                            SCAN ONLY
                          </span>
                        )}
                      </div>

                      {/* Badge de Estado Diagnóstico */}
                      <div className="w-40 shrink-0 text-center font-sans">
                        {renderBadge(table)}
                      </div>

                      {/* Dependencias (FKs y Vistas) */}
                      <div className="w-40 shrink-0 text-center font-sans">
                        {table.dependenciesCount > 0 ? (
                          <span 
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full"
                            title={`${table.incomingFkCount} Foreign Keys entrantes, ${table.referencingObjectsCount} vistas/SPs que dependen de ella`}
                          >
                            <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>{table.dependenciesCount} dependencias</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 text-[11px]">0 dependencias</span>
                        )}
                      </div>

                      {/* Última Actividad */}
                      <div className="w-44 shrink-0 font-sans">
                        {formatActivity(table.daysSinceLastActivity, table.lastActivityDate)}
                      </div>

                      {/* Filas */}
                      <div className="w-32 shrink-0 text-right text-slate-200">
                        {table.totalRows.toLocaleString()}
                      </div>

                      {/* Tamaño Físico (incluyendo LOBs) */}
                      <div className="w-32 shrink-0 text-right text-slate-400" title={table.lobSizeMb > 0 ? `LOBs: ${table.lobSizeMb} MB` : undefined}>
                        <span>{table.totalSizeMb.toFixed(2)}</span>
                        {table.lobSizeMb > 0 && (
                          <span className="text-[10px] text-indigo-400 block -mt-1 font-sans">
                            LOB {table.lobSizeMb}M
                          </span>
                        )}
                      </div>

                      {/* Lecturas */}
                      <div className="w-32 shrink-0 text-right">
                        <span className={table.totalReads > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                          {table.totalReads.toLocaleString()}
                        </span>
                      </div>

                      {/* Escrituras */}
                      <div className="w-28 shrink-0 text-right pr-4">
                        <span className={table.totalWrites > 0 ? 'text-blue-400 font-semibold' : 'text-slate-500'}>
                          {table.totalWrites.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pie de Tabla con Resumen */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
        <div>
          Mostrando <strong className="text-white">{filteredTables.length}</strong> de <strong className="text-white">{classifiedTables.length}</strong> tablas en la base de datos.
        </div>
        <div className="flex items-center gap-3">
          <span>{selectedTablesList.length} seleccionadas</span>
          {selectedTablesList.length > 0 && (
            <button
              onClick={() => setIsArchiveModalOpen(true)}
              className="text-indigo-400 hover:text-indigo-300 font-medium underline"
            >
              Generar Script DDL Seguro ({selectedTablesList.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
