'use client';

import React, { useMemo } from 'react';
import { 
  X, 
  History, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Calendar, 
  Clock, 
  Database,
  ShieldCheck,
  CheckCircle2,
  Download,
  Ban,
  Server,
  FileWarning
} from 'lucide-react';
import { AuditSnapshot, AuditSummary, TableMetric } from '@/lib/types';

interface SnapshotCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  previousSnapshot: AuditSnapshot;
  currentSummary: AuditSummary;
  onFilterPersistentZeroIo?: (tableNames: string[]) => void;
}

export function SnapshotCompareModal({
  isOpen,
  onClose,
  previousSnapshot,
  currentSummary,
  onFilterPersistentZeroIo,
}: SnapshotCompareModalProps) {
  if (!isOpen) return null;

  // 1. Extraer metadatos con retrocompatibilidad
  const snapshotMetadata = useMemo(() => {
    return {
      databaseName: previousSnapshot.metadata?.databaseName || previousSnapshot.databaseName || '',
      serverInstance: previousSnapshot.metadata?.serverInstance || previousSnapshot.serverName || '',
      createdAt: previousSnapshot.metadata?.createdAt || previousSnapshot.snapshotDate || '',
      uptimeStartTime: previousSnapshot.metadata?.uptimeStartTime || previousSnapshot.sqlServerStartTime || '',
      totalTablesCount: previousSnapshot.metadata?.totalTablesCount || previousSnapshot.tables?.length || 0,
    };
  }, [previousSnapshot]);

  // 2. Validaciones de integridad y compatibilidad
  const currentDbName = (currentSummary.databaseName || '').trim();
  const snapshotDbName = (snapshotMetadata.databaseName || '').trim();
  const isDbMismatch = snapshotDbName && currentDbName && snapshotDbName.toLowerCase() !== currentDbName.toLowerCase();

  const currentServer = (currentSummary.serverInfo.serverName || '').trim();
  const snapshotServer = (snapshotMetadata.serverInstance || '').trim();
  const isServerMismatch = snapshotServer && currentServer && snapshotServer.toLowerCase() !== currentServer.toLowerCase();

  // 3. Comparación analítica de los dos snapshots (solo si no hay discrepancia de DB)
  const comparison = useMemo(() => {
    if (isDbMismatch) {
      return null;
    }

    const prevMap = new Map(previousSnapshot.tables.map(t => [t.fullName.toLowerCase(), t]));
    const currMap = new Map(currentSummary.tables.map(t => [t.fullName.toLowerCase(), t]));

    const persistentZeroIo: TableMetric[] = [];
    const rowsChanged: Array<{
      table: TableMetric;
      prevRows: number;
      currRows: number;
      deltaRows: number;
    }> = [];
    const sizeChanged: Array<{
      table: TableMetric;
      prevSize: number;
      currSize: number;
      deltaSize: number;
    }> = [];
    const newTables: TableMetric[] = [];
    const removedTables: string[] = [];

    // Analizar tablas actuales
    for (const curr of currentSummary.tables) {
      const prev = prevMap.get(curr.fullName.toLowerCase());
      if (!prev) {
        newTables.push(curr);
      } else {
        // Tablas que tenían 0 lecturas y 0 escrituras antes y siguen en 0
        const prevZero = (prev.totalReads === 0 && prev.totalWrites === 0) || prev.classification === 'obsolete';
        const currZero = curr.totalReads === 0 && curr.totalWrites === 0;
        if (prevZero && currZero) {
          persistentZeroIo.push(curr);
        }

        if (curr.totalRows !== prev.totalRows) {
          rowsChanged.push({
            table: curr,
            prevRows: prev.totalRows,
            currRows: curr.totalRows,
            deltaRows: curr.totalRows - prev.totalRows,
          });
        }

        const deltaS = Number((curr.totalSizeMb - prev.totalSizeMb).toFixed(2));
        if (Math.abs(deltaS) >= 0.01) {
          sizeChanged.push({
            table: curr,
            prevSize: prev.totalSizeMb,
            currSize: curr.totalSizeMb,
            deltaSize: deltaS,
          });
        }
      }
    }

    // Tablas eliminadas
    for (const prev of previousSnapshot.tables) {
      if (!currMap.has(prev.fullName.toLowerCase())) {
        removedTables.push(prev.fullName);
      }
    }

    // Calcular días entre snapshots
    const prevDate = snapshotMetadata.createdAt ? new Date(snapshotMetadata.createdAt) : new Date();
    const currDate = new Date(currentSummary.auditedAt);
    const daysBetween = Math.max(0, Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      prevDate: prevDate.toLocaleDateString(),
      currDate: currDate.toLocaleDateString(),
      daysBetween,
      persistentZeroIo,
      rowsChanged,
      sizeChanged,
      newTables,
      removedTables,
    };
  }, [previousSnapshot, currentSummary, isDbMismatch, snapshotMetadata]);

  const handleApplyFilter = () => {
    if (comparison && onFilterPersistentZeroIo) {
      onFilterPersistentZeroIo(comparison.persistentZeroIo.map(t => t.fullName));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isDbMismatch 
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}>
              {isDbMismatch ? <Ban className="w-5 h-5" /> : <History className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Comparativa Histórica de Snapshots</span>
                {isDbMismatch && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    Incompatible
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {isDbMismatch ? (
                  <span className="text-rose-300">Conflicto de Base de Datos entre el archivo y la auditoría actual</span>
                ) : (
                  <span>
                    Foto anterior: <span className="text-slate-200 font-mono">{comparison?.prevDate}</span> vs Actual: <span className="text-slate-200 font-mono">{comparison?.currDate}</span> ({comparison?.daysBetween} días transcurridos)
                  </span>
                )}
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

        {/* CASO 1: BLOQUEO POR INCOMPATIBILIDAD DE BASE DE DATOS */}
        {isDbMismatch ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6 flex-1 overflow-auto custom-scrollbar">
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 shadow-xl shadow-rose-950/20">
              <FileWarning className="w-12 h-12" />
            </div>

            <div className="space-y-2 max-w-lg">
              <h4 className="text-lg font-bold text-white">
                No se puede comparar: Bases de Datos Diferentes
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                El archivo de snapshot que intentas contrastar pertenece a una base de datos distinta a la que tienes seleccionada actualmente.
              </p>
            </div>

            {/* Comparativa Visual de Metadatos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl text-xs text-left">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
                  Snapshot Cargado (.json)
                </span>
                <div className="space-y-1 font-mono">
                  <div className="flex items-center gap-1.5 text-slate-200">
                    <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-bold text-rose-300">[{snapshotDbName || 'Sin Nombre'}]</span>
                  </div>
                  {snapshotServer && (
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                      <Server className="w-3.5 h-3.5 shrink-0" />
                      <span>{snapshotServer}</span>
                    </div>
                  )}
                  {snapshotMetadata.createdAt && (
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{new Date(snapshotMetadata.createdAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
                  Auditoría Actual Activa
                </span>
                <div className="space-y-1 font-mono">
                  <div className="flex items-center gap-1.5 text-slate-200">
                    <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-bold text-emerald-300">[{currentDbName}]</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Server className="w-3.5 h-3.5 shrink-0" />
                    <span>{currentServer}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px]">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>{new Date(currentSummary.auditedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 max-w-md">
              💡 Para realizar una auditoría temporal válida, selecciona la base de datos <strong className="text-white font-mono">[{snapshotDbName}]</strong> en el selector principal o carga un snapshot correspondiente a <strong className="text-white font-mono">[{currentDbName}]</strong>.
            </p>

            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
            >
              Cerrar y Seleccionar Base de Datos Correcta
            </button>
          </div>
        ) : (
          /* CASO 2: SNAPSHOT VÁLIDO CON MISMA BASE DE DATOS */
          <>
            {/* Aviso si la base coincide pero el servidor/instancia es distinto */}
            {isServerMismatch && (
              <div className="p-3.5 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-3 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-amber-200">
                    Aviso de Instancia: Servidores de Origen Diferentes
                  </span>
                  <span className="text-amber-300/80">
                    El snapshot proviene de la instancia <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-200 font-mono">{snapshotServer}</code>, mientras que estás auditando <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-200 font-mono">{currentServer}</code>. Los nombres de base de datos coinciden (<code className="font-mono">[{currentDbName}]</code>).
                  </span>
                </div>
              </div>
            )}

            {/* Resumen de KPIs de Contraste */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/40 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <span className="text-rose-400 font-semibold block text-[11px]">0 I/O Persistente</span>
                <span className="text-xl font-bold text-white mt-1 block">
                  {comparison?.persistentZeroIo.length || 0}
                </span>
                <span className="text-[10px] text-rose-300/80">Confirmadas muertas en {comparison?.daysBetween}d</span>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <span className="text-blue-400 font-semibold block text-[11px]">Variación de Filas</span>
                <span className="text-xl font-bold text-white mt-1 block">
                  {comparison?.rowsChanged.length || 0}
                </span>
                <span className="text-[10px] text-slate-400">Tablas con cambios de data</span>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <span className="text-emerald-400 font-semibold block text-[11px]">Tablas Nuevas</span>
                <span className="text-xl font-bold text-white mt-1 block">
                  {comparison?.newTables.length || 0}
                </span>
                <span className="text-[10px] text-slate-400">Creadas desde el snapshot</span>
              </div>

              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <span className="text-purple-400 font-semibold block text-[11px]">Tablas Eliminadas</span>
                <span className="text-xl font-bold text-white mt-1 block">
                  {comparison?.removedTables.length || 0}
                </span>
                <span className="text-[10px] text-slate-400">Ya no existen en catálogo</span>
              </div>
            </div>

            {/* Listado de Tablas 0 I/O Persistentes */}
            <div className="flex-1 overflow-auto p-5 space-y-4 custom-scrollbar">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-white">Tablas con Cero I/O Confirmado en Ambos Snapshots</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    {comparison?.persistentZeroIo.length || 0} tablas
                  </span>
                </div>
                {(comparison?.persistentZeroIo.length || 0) > 0 && onFilterPersistentZeroIo && (
                  <button
                    onClick={handleApplyFilter}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-rose-500/20"
                  >
                    Aislar sólo estas tablas en la tabla
                  </button>
                )}
              </div>

              {(comparison?.persistentZeroIo.length || 0) === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No hay tablas que se mantengan estrictamente con 0 lecturas y escrituras entre ambos snapshots.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/60 bg-slate-950 font-mono text-xs">
                  {comparison?.persistentZeroIo.map(t => (
                    <div key={t.fullName} className="p-3 flex items-center justify-between hover:bg-slate-900/60 transition">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                        <span className="text-slate-400">{t.schemaName}.</span>
                        <span className="text-slate-100 font-semibold">{t.tableName}</span>
                        {t.dependenciesCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {t.dependenciesCount} dependencias
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-slate-400 font-sans text-xs">
                        <span>{t.totalRows.toLocaleString()} filas</span>
                        <span>{t.totalSizeMb.toFixed(2)} MB</span>
                        <span className="text-rose-400 font-medium">0 I/O en {comparison.daysBetween}d</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Variación de Filas si existen */}
              {(comparison?.rowsChanged.length || 0) > 0 && (
                <div className="pt-4 border-t border-slate-800">
                  <span className="font-semibold text-sm text-white block mb-3">
                    Top Tablas con Variación de Registros ({comparison?.rowsChanged.length})
                  </span>
                  <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/60 bg-slate-950 font-mono text-xs max-h-48 overflow-y-auto custom-scrollbar">
                    {comparison?.rowsChanged.slice(0, 10).map(({ table, prevRows, currRows, deltaRows }) => (
                      <div key={table.fullName} className="p-2.5 flex items-center justify-between">
                        <span className="text-slate-200">{table.fullName}</span>
                        <div className="flex items-center gap-3 font-sans">
                          <span className="text-slate-400">{prevRows.toLocaleString()} → {currRows.toLocaleString()}</span>
                          <span className={`font-semibold flex items-center gap-0.5 ${deltaRows > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {deltaRows > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {deltaRows > 0 ? `+${deltaRows.toLocaleString()}` : deltaRows.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Pie */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
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
