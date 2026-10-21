'use client';

import React from 'react';
import { 
  TableProperties, 
  Activity, 
  Archive, 
  Trash2, 
  Clock, 
  Info, 
  CalendarClock, 
  HardDriveDownload, 
  AlertTriangle,
  FolderMinus,
  Binary
} from 'lucide-react';
import { AuditSummary } from '@/lib/types';

interface KpiCardsProps {
  summary: AuditSummary;
}

export function KpiCards({ summary }: KpiCardsProps) {
  const { kpis, uptimeFormatted, sqlServerStartTime, uptimeDays } = summary;
  const staleCount = kpis.staleCount || 0;
  const stalePct = kpis.stalePct || 0;

  // Formato para Espacio Recuperable (MB o GB)
  const formatSpace = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Aviso de Contextualización del DBA con Alertas Clave */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-slate-300">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-white mb-0.5">
              Buffer de Telemetría Activo: {uptimeFormatted} (desde el {new Date(sqlServerStartTime).toLocaleDateString()})
            </p>
            <p className="text-slate-400">
              Métricas consolidadas de <code className="text-blue-300">sys.dm_db_partition_stats</code>, <code className="text-blue-300">sys.dm_db_index_usage_stats</code> y detección de Foreign Keys / dependencias programables.
            </p>
          </div>
        </div>

        {/* Alerta de Dependencias en Tablas Inactivas */}
        {kpis.tablesWithDependenciesCount > 0 && (
          <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl shrink-0 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{kpis.tablesWithDependenciesCount} tablas inactivas tienen dependencias (FKs/Vistas)</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
        {/* KPI: Total Tablas */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Total Tablas</span>
            <div className="p-1.5 bg-slate-800 rounded-lg text-slate-300">
              <TableProperties className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {kpis.totalTables.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <span>{kpis.totalRows.toLocaleString()} filas</span>
              {kpis.emptyTablesCount > 0 && (
                <span className="text-slate-500">({kpis.emptyTablesCount} vacías)</span>
              )}
            </p>
          </div>
        </div>

        {/* KPI: Activas Recientes */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-xs font-medium text-slate-400">Activas</span>
            <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-emerald-400 tracking-tight">
                {kpis.activeCount.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-emerald-500/90">
                ({kpis.activePct}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Uso frecuente reciente
            </p>
          </div>
        </div>

        {/* KPI: Solo Lectura Reciente */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400 mb-2">
            <span className="text-xs font-medium text-slate-400">Solo Lectura</span>
            <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Archive className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-amber-400 tracking-tight">
                {kpis.readOnlyCount.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-amber-500/90">
                ({kpis.readOnlyPct}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              0 escrituras recientes
            </p>
          </div>
        </div>

        {/* KPI: Estancadas (> 30d sin uso) */}
        <div className="bg-slate-900 border border-orange-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between text-orange-400 mb-2">
            <span className="text-xs font-medium text-slate-300">Estancadas &gt;30d</span>
            <div className="p-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <CalendarClock className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-orange-400 tracking-tight">
                {staleCount.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-orange-500/90">
                ({stalePct}%)
              </span>
            </div>
            <p className="text-[11px] text-orange-400/80 font-medium mt-1">
              Lecturas viejas sin uso
            </p>
          </div>
        </div>

        {/* KPI: 0 I/O Total */}
        <div className="bg-slate-900 border border-rose-950/40 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between text-rose-400 mb-2">
            <span className="text-xs font-medium text-slate-300">0 I/O Total</span>
            <div className="p-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg">
              <Trash2 className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-rose-400 tracking-tight">
                {kpis.obsoleteCount.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-rose-500/90">
                ({kpis.obsoletePct}%)
              </span>
            </div>
            <p className="text-[11px] text-rose-400/80 font-medium mt-1">
              0 lecturas y escrituras
            </p>
          </div>
        </div>

        {/* NUEVO KPI: Espacio Recuperable */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden shadow-lg shadow-indigo-500/5">
          <div className="flex items-center justify-between text-indigo-400 mb-2">
            <span className="text-xs font-medium text-slate-200">Espacio Recuperable</span>
            <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <HardDriveDownload className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-indigo-300 tracking-tight">
              {formatSpace(kpis.reclaimableSizeMb)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              En {kpis.obsoleteCount} tablas sin I/O
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
