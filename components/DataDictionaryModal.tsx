'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  BookOpen, 
  Network, 
  Loader2, 
  Layers, 
  Key, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { TableMetric, ColumnMetadata, ForeignKeyRelationship, DatabaseEngine } from '@/lib/types';

interface DataDictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTables: TableMetric[];
  databaseName: string;
  engine?: DatabaseEngine;
  connectionPayload?: {
    engine?: DatabaseEngine;
    encryptedConnectionString: string;
    algorithm: string;
    secretKey: string;
  } | null;
}

export function DataDictionaryModal({
  isOpen,
  onClose,
  selectedTables,
  databaseName,
  engine,
  connectionPayload,
}: DataDictionaryModalProps) {
  const [activeTab, setActiveTab] = useState<'markdown' | 'mermaid'>('markdown');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyRelationship[]>([]);

  useEffect(() => {
    if (!isOpen || !connectionPayload || selectedTables.length === 0) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch('/api/data-dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: connectionPayload.engine || engine || 'sqlserver',
        encryptedConnectionString: connectionPayload.encryptedConnectionString,
        algorithm: connectionPayload.algorithm,
        secretKey: connectionPayload.secretKey,
        databaseName,
        tables: selectedTables.map(t => t.fullName),
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (data.success) {
          setColumns(data.columns || []);
          setForeignKeys(data.foreignKeys || []);
        } else {
          setError(data.error || 'Error al obtener metadatos de las tablas.');
        }
      })
      .catch(err => {
        if (isMounted) setError(err.message || 'Error de conexión.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, connectionPayload, selectedTables, databaseName]);

  // Agrupar columnas por tabla
  const columnsByTable = useMemo(() => {
    const map = new Map<string, ColumnMetadata[]>();
    for (const col of columns) {
      const full = `${col.schemaName}.${col.tableName}`;
      if (!map.has(full)) {
        map.set(full, []);
      }
      map.get(full)!.push(col);
    }
    return map;
  }, [columns]);

  // Formatear tipo SQL amigable
  const formatSqlType = (col: ColumnMetadata) => {
    const t = col.dataType.toLowerCase();
    if (['varchar', 'nvarchar', 'char', 'nchar', 'varbinary', 'binary'].includes(t)) {
      if (col.maxLength === -1) return `${col.dataType}(max)`;
      const len = ['nvarchar', 'nchar'].includes(t) ? col.maxLength / 2 : col.maxLength;
      return `${col.dataType}(${len})`;
    }
    if (['decimal', 'numeric'].includes(t)) {
      return `${col.dataType}(${col.precision},${col.scale})`;
    }
    return col.dataType;
  };

  // Generador de Diccionario Markdown
  const markdownContent = useMemo(() => {
    const lines: string[] = [];
    const dateStr = new Date().toISOString().slice(0, 10);

    lines.push(`# Diccionario de Datos: ${databaseName}`);
    lines.push(`> **Generado:** ${dateStr} | **Tablas Documentadas:** ${selectedTables.length}`);
    lines.push('');

    selectedTables.forEach((table) => {
      lines.push(`## Tabla: \`${table.schemaName}.${table.tableName}\``);
      lines.push('');
      lines.push(`- **Total Registros:** ${table.totalRows.toLocaleString()}`);
      lines.push(`- **Tamaño Estimado:** ${table.totalSizeMb.toFixed(2)} MB (LOBs: ${table.lobSizeMb || 0} MB)`);
      lines.push(`- **Última Actividad:** ${table.daysSinceLastActivity !== null ? `Hace ${table.daysSinceLastActivity} días` : 'Sin registros de I/O'}`);
      lines.push(`- **Lecturas:** ${table.totalReads.toLocaleString()} | **Escrituras:** ${table.totalWrites.toLocaleString()}`);
      lines.push('');

      const tableCols = columnsByTable.get(table.fullName) || [];
      if (tableCols.length === 0) {
        lines.push('*Sin columnas detectadas o tabla sin permisos de lectura.*');
      } else {
        lines.push('| # | Columna | Tipo | Nulable | PK | Descripción |');
        lines.push('|---|---------|------|---------|----|-------------|');
        tableCols.forEach((c) => {
          const pkBadge = c.isPrimaryKey ? '🔑 PK' : (c.isIdentity ? '🆔 Identity' : '');
          const nullable = c.isNullable ? 'SÍ' : '**NO**';
          const desc = c.columnDescription ? c.columnDescription.replace(/\|/g, '\\|') : '-';
          lines.push(`| ${c.columnId} | \`${c.columnName}\` | \`${formatSqlType(c)}\` | ${nullable} | ${pkBadge} | ${desc} |`);
        });
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    return lines.join('\n');
  }, [databaseName, selectedTables, columnsByTable]);

  // Generador de Diagrama Mermaid ERD
  const mermaidContent = useMemo(() => {
    const lines: string[] = [];
    lines.push('erDiagram');

    // Sanitizar identificador para Mermaid: dbo.Customers -> dbo_Customers
    const sanitizeId = (schema: string, table: string) => `${schema}_${table}`.replace(/[^a-zA-Z0-9_]/g, '_');

    // 1. Relaciones FK
    const selectedFullNames = new Set(selectedTables.map(t => t.fullName.toLowerCase()));
    const declaredRelations = new Set<string>();

    foreignKeys.forEach(fk => {
      const parentFull = `${fk.parentSchema}.${fk.parentTable}`.toLowerCase();
      const refFull = `${fk.refSchema}.${fk.refTable}`.toLowerCase();

      // Solo mostrar relaciones entre las tablas seleccionadas
      if (selectedFullNames.has(parentFull) && selectedFullNames.has(refFull)) {
        const pId = sanitizeId(fk.parentSchema, fk.parentTable);
        const rId = sanitizeId(fk.refSchema, fk.refTable);
        const relKey = `${pId}-${rId}-${fk.parentColumn}`;
        if (!declaredRelations.has(relKey)) {
          declaredRelations.add(relKey);
          lines.push(`    ${rId} ||--o{ ${pId} : "${fk.parentColumn}"`);
        }
      }
    });

    lines.push('');

    // 2. Definición de Entidades y Campos clave
    selectedTables.forEach(t => {
      const entityId = sanitizeId(t.schemaName, t.tableName);
      const tableCols = columnsByTable.get(t.fullName) || [];

      lines.push(`    ${entityId} {`);
      if (tableCols.length === 0) {
        lines.push(`        string placeholder`);
      } else {
        tableCols.forEach(col => {
          // Limpiar tipo para Mermaid (sin espacios ni caracteres especiales)
          const cleanType = col.dataType.replace(/[^a-zA-Z0-9]/g, '');
          const cleanCol = col.columnName.replace(/[^a-zA-Z0-9_]/g, '_');
          let extra = '';
          if (col.isPrimaryKey) extra = ' PK';
          lines.push(`        ${cleanType} ${cleanCol}${extra}`);
        });
      }
      lines.push('    }');
    });

    return lines.join('\n');
  }, [selectedTables, foreignKeys, columnsByTable]);

  if (!isOpen || selectedTables.length === 0) return null;

  const currentContent = activeTab === 'markdown' ? markdownContent : mermaidContent;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = activeTab === 'markdown' ? 'md' : 'mmd';
    const mime = activeTab === 'markdown' ? 'text/markdown;charset=utf-8;' : 'text/plain;charset=utf-8;';
    const blob = new Blob([currentContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Documentacion_${databaseName}_${activeTab}_${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Encabezado */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Documentación Técnica de Tablas Vivas</span>
                {isLoading && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
              </h3>
              <p className="text-xs text-slate-400">
                Diccionario de Datos estructurado y Diagrama Entidad-Relación (Mermaid ERD) para <code className="text-emerald-300 font-mono">[{databaseName}]</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de error si falla */}
        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Pestañas y Controles */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('markdown')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
                activeTab === 'markdown'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Diccionario Markdown</span>
            </button>
            <button
              onClick={() => setActiveTab('mermaid')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
                activeTab === 'mermaid'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Diagrama Mermaid ERD</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado al Portapapeles' : 'Copiar'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
              <span>Descargar .{activeTab === 'markdown' ? 'md' : 'mmd'}</span>
            </button>
          </div>
        </div>

        {/* Visor de Contenido */}
        <div className="flex-1 overflow-auto p-5 bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed border-t border-slate-900 select-all">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3 font-sans">
              <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
              <p>Consultando catálogo de columnas, tipos y claves foráneas...</p>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap">{currentContent}</pre>
          )}
        </div>

        {/* Pie del Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>{selectedTables.length} tablas vivas documentadas con metadatos extendidos.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
