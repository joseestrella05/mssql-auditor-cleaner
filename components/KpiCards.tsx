'use client';

import React from 'react';
import {
  TableProperties,
  Activity,
  Archive,
  Trash2,
  Radio,
  CalendarClock,
  HardDriveDownload,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  type LucideIcon,
} from 'lucide-react';
import { AuditSummary } from '@/lib/types';

interface KpiCardsProps {
  summary: AuditSummary;
}

type Tone = 'neutral' | 'emerald' | 'amber' | 'orange' | 'rose' | 'indigo';

// Clases estáticas por tono (Tailwind JIT necesita los nombres completos)
const TONES: Record<Tone, { value: string; icon: string; bar: string; card: string; pill: string }> = {
  neutral: {
    value: 'text-white',
    icon: 'text-slate-300 bg-slate-800/80 ring-slate-700',
    bar: 'bg-slate-500',
    card: 'border-slate-800 hover:border-slate-700',
    pill: 'text-slate-300 bg-slate-800 ring-slate-700',
  },
  emerald: {
    value: 'text-emerald-300',
    icon: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/25',
    bar: 'bg-emerald-400',
    card: 'border-slate-800 hover:border-emerald-500/40',
    pill: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  },
  amber: {
    value: 'text-amber-300',
    icon: 'text-amber-400 bg-amber-500/10 ring-amber-500/25',
    bar: 'bg-amber-400',
    card: 'border-slate-800 hover:border-amber-500/40',
    pill: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
  },
  orange: {
    value: 'text-orange-300',
    icon: 'text-orange-400 bg-orange-500/10 ring-orange-500/25',
    bar: 'bg-orange-400',
    card: 'border-slate-800 hover:border-orange-500/40',
    pill: 'text-orange-300 bg-orange-500/10 ring-orange-500/25',
  },
  rose: {
    value: 'text-rose-300',
    icon: 'text-rose-400 bg-rose-500/10 ring-rose-500/25',
    bar: 'bg-rose-400',
    card: 'border-rose-500/25 hover:border-rose-500/50 bg-gradient-to-b from-rose-500/[0.06] to-transparent',
    pill: 'text-rose-300 bg-rose-500/10 ring-rose-500/30',
  },
  indigo: {
    value: 'text-indigo-200',
    icon: 'text-indigo-300 bg-indigo-500/15 ring-indigo-400/30',
    bar: 'bg-indigo-400',
    card: 'border-indigo-500/30 hover:border-indigo-400/60 bg-gradient-to-b from-indigo-500/[0.08] to-transparent',
    pill: 'text-indigo-200 bg-indigo-500/15 ring-indigo-400/30',
  },
};

interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  value: React.ReactNode;
  unit?: string;
  pct?: number;
  footnote: React.ReactNode;
  badge?: React.ReactNode;
}

function KpiCard({ label, icon: Icon, tone, value, unit, pct, footnote, badge }: KpiCardProps) {
  const t = TONES[tone];
  return (
    <div
      className={`group relative flex flex-col justify-between gap-3 rounded-xl border bg-slate-900/80 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${t.card}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </span>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 ring-inset ${t.icon}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[28px] leading-none font-semibold tracking-tight tabular-nums ${t.value}`}>
            {value}
          </span>
          {unit && <span className="text-xs font-medium text-slate-500">{unit}</span>}
          {pct !== undefined && (
            <span className={`ml-auto rounded px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ring-1 ring-inset ${t.pill}`}>
              {pct}%
            </span>
          )}
        </div>

        {/* Barra de proporción respecto al total */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${t.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, pct ?? 100))}%` }}
          />
        </div>

        <div className="mt-2 flex min-h-[18px] items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate">{footnote}</span>
          {badge}
        </div>
      </div>
    </div>
  );
}

export function KpiCards({ summary }: KpiCardsProps) {
  const { kpis, uptimeFormatted, sqlServerStartTime, uptimeDays } = summary;
  const staleCount = kpis.staleCount || 0;
  const stalePct = kpis.stalePct || 0;

  // Formato para Espacio Recuperable (MB o GB) separado en valor y unidad
  const formatSpace = (mb: number): [string, string] => {
    if (mb >= 1024) {
      return [(mb / 1024).toFixed(2), 'GB'];
    }
    return [mb.toFixed(2), 'MB'];
  };
  const [spaceValue, spaceUnit] = formatSpace(kpis.reclaimableSizeMb);
  const reclaimablePct = kpis.totalSizeMb > 0
    ? Math.round((kpis.reclaimableSizeMb / kpis.totalSizeMb) * 1000) / 10
    : 0;

  // Salud del esquema: proporción de tablas sin uso (0 I/O + estancadas)
  const unusedPct = (kpis.obsoletePct || 0) + stalePct;
  const health =
    unusedPct >= 40
      ? { label: 'Crítico', icon: ShieldX, cls: 'text-rose-300 bg-rose-500/10 ring-rose-500/30', dot: 'bg-rose-400' }
      : unusedPct >= 15
        ? { label: 'Requiere atención', icon: ShieldAlert, cls: 'text-amber-300 bg-amber-500/10 ring-amber-500/30', dot: 'bg-amber-400' }
        : { label: 'Saludable', icon: ShieldCheck, cls: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30', dot: 'bg-emerald-400' };
  const HealthIcon = health.icon;

  // Ventana de telemetría corta = DMVs reiniciadas recientemente, métricas poco representativas
  const shortWindow = uptimeDays < 7;

  const distribution = [
    { key: 'active', pct: kpis.activePct, cls: 'bg-emerald-400', label: 'Activas' },
    { key: 'readonly', pct: kpis.readOnlyPct, cls: 'bg-amber-400', label: 'Solo lectura' },
    { key: 'stale', pct: stalePct, cls: 'bg-orange-400', label: 'Estancadas' },
    { key: 'obsolete', pct: kpis.obsoletePct, cls: 'bg-rose-400', label: '0 I/O' },
  ];

  return (
    <section className="space-y-3">
      {/* Barra de estado: ventana de telemetría, salud del esquema y alertas */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
          </span>
          <div className="min-w-0 text-xs">
            <p className="flex flex-wrap items-center gap-x-2 font-medium text-slate-200">
              <Radio className="h-3.5 w-3.5 text-sky-400" />
              <span>Ventana de telemetría</span>
              <span className="font-mono text-sky-300 tabular-nums">{uptimeFormatted}</span>
              <span className="text-slate-500">
                desde {new Date(sqlServerStartTime).toLocaleDateString()}
              </span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              Fuente: <code className="text-slate-400">sys.dm_db_partition_stats</code> ·{' '}
              <code className="text-slate-400">sys.dm_db_index_usage_stats</code> · FKs y dependencias programables
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
          {shortWindow && (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-amber-300 ring-1 ring-inset ring-amber-500/30 bg-amber-500/10"
              title="El contador de uso se reinicia con cada arranque del servicio. Con menos de 7 días de uptime, las métricas pueden no ser representativas."
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Ventana corta (&lt;7d)
            </span>
          )}
          {kpis.tablesWithDependenciesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-amber-300 ring-1 ring-inset ring-amber-500/30 bg-amber-500/10">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="tabular-nums">{kpis.tablesWithDependenciesCount}</span> inactivas con FKs/Vistas
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ring-inset ${health.cls}`}
            title={`${unusedPct.toFixed(1)}% de las tablas sin uso (0 I/O + estancadas)`}
          >
            <HealthIcon className="h-3.5 w-3.5" />
            Esquema: {health.label}
          </span>
        </div>
      </div>

      {/* Distribución de clasificación en una sola barra */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
          {distribution.map((d) => (
            <div
              key={d.key}
              className={`${d.cls} h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${d.pct}%` }}
              title={`${d.label}: ${d.pct}%`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          {distribution.map((d) => (
            <span key={d.key} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${d.cls}`} />
              {d.label}
              <span className="font-mono text-slate-300 tabular-nums">{d.pct}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total tablas"
          icon={TableProperties}
          tone="neutral"
          value={kpis.totalTables.toLocaleString()}
          footnote={
            <>
              <span className="tabular-nums">{kpis.totalRows.toLocaleString()}</span> filas
              {kpis.emptyTablesCount > 0 && (
                <span className="text-slate-600"> · {kpis.emptyTablesCount} vacías</span>
              )}
            </>
          }
        />

        <KpiCard
          label="Activas"
          icon={Activity}
          tone="emerald"
          value={kpis.activeCount.toLocaleString()}
          pct={kpis.activePct}
          footnote="Lecturas y escrituras recientes"
        />

        <KpiCard
          label="Solo lectura"
          icon={Archive}
          tone="amber"
          value={kpis.readOnlyCount.toLocaleString()}
          pct={kpis.readOnlyPct}
          footnote="0 escrituras registradas"
        />

        <KpiCard
          label="Estancadas >30d"
          icon={CalendarClock}
          tone="orange"
          value={staleCount.toLocaleString()}
          pct={stalePct}
          footnote="Sin actividad reciente"
        />

        <KpiCard
          label="0 I/O total"
          icon={Trash2}
          tone="rose"
          value={kpis.obsoleteCount.toLocaleString()}
          pct={kpis.obsoletePct}
          footnote="0 lecturas · 0 escrituras"
          badge={
            kpis.obsoleteCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300 ring-1 ring-inset ring-rose-500/30 bg-rose-500/10">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                Candidatas
              </span>
            )
          }
        />

        <KpiCard
          label="Espacio recuperable"
          icon={HardDriveDownload}
          tone="indigo"
          value={spaceValue}
          unit={spaceUnit}
          pct={reclaimablePct}
          footnote={<>En <span className="tabular-nums">{kpis.obsoleteCount}</span> tablas sin I/O</>}
          badge={
            kpis.reclaimableSizeMb > 0 && (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-200 ring-1 ring-inset ring-indigo-400/30 bg-indigo-500/15">
                del total
              </span>
            )
          }
        />
      </div>
    </section>
  );
}
