import type { AuditSummary } from './types';


/**
 * Genera un informe técnico estructurado en Markdown apto para GitHub, Notion o wikis de arquitectura.
 */
export function generateMarkdownReport(summary: AuditSummary): string {
  const lines: string[] = [];

  lines.push(`# Informe de Auditoría y Saneamiento de Base de Datos: \`${summary.databaseName}\``);
  lines.push('');
  lines.push(`> **Servidor:** \`${summary.serverInfo.serverName}\` (${summary.serverInfo.edition} ${summary.serverInfo.productVersion})  `);
  lines.push(`> **Fecha de Auditoría:** ${new Date(summary.auditedAt).toLocaleString()}  `);
  lines.push(`> **Inicio del Servicio SQL Server:** ${new Date(summary.sqlServerStartTime).toLocaleString()}  `);
  lines.push(`> **Tiempo de Acumulación de Métricas (Uptime):** **${summary.uptimeFormatted}**  `);
  lines.push('');

  lines.push('## 1. Resumen Ejecutivo (KPIs)');
  lines.push('');
  lines.push('| Métrica | Valor | % del Total |');
  lines.push('| :--- | :---: | :---: |');
  lines.push(`| **Total de Tablas Analizadas** | **${summary.kpis.totalTables.toLocaleString()}** | 100.0% |`);
  lines.push(`| 🟢 **Tablas Activas (Uso Reciente)** | **${summary.kpis.activeCount.toLocaleString()}** | **${summary.kpis.activePct}%** |`);
  lines.push(`| 🟡 **Tablas Solo Lectura Reciente** | **${summary.kpis.readOnlyCount.toLocaleString()}** | **${summary.kpis.readOnlyPct}%** |`);
  lines.push(`| 🟠 **Tablas Estancadas / Sin Uso Hace >30d** | **${(summary.kpis.staleCount || 0).toLocaleString()}** | **${summary.kpis.stalePct || 0}%** |`);
  lines.push(`| 🔴 **Tablas Obsoletas (0 I/O en Uptime)** | **${summary.kpis.obsoleteCount.toLocaleString()}** | **${summary.kpis.obsoletePct}%** |`);
  lines.push(`| **Total de Filas Acumuladas** | **${summary.kpis.totalRows.toLocaleString()}** | - |`);
  lines.push(`| **Espacio de Datos Estimado** | **${summary.kpis.totalSizeMb.toLocaleString()} MB** | - |`);
  lines.push(`| **Total Operaciones de Lectura** | **${summary.kpis.totalReads.toLocaleString()}** | - |`);
  lines.push(`| **Total Operaciones de Escritura** | **${summary.kpis.totalWrites.toLocaleString()}** | - |`);
  lines.push('');

  lines.push('### ⚠️ Contextualización Técnica del DBA');
  lines.push(`> Las estadísticas de lectura y escritura provienen de la DMV \`sys.dm_db_index_usage_stats\`. `);
  lines.push(`> Esta instancia ha permanecido activa durante **${summary.uptimeFormatted}**.`);
  lines.push('> Aquellas tablas con **0 lecturas y 0 escrituras** durante este período representan candidatos directos a archivado y eliminación, aliviando costos de backup, memoria y deuda técnica.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // 2. Tablas Inactivas / Sin Uso
  lines.push(`## 2. Tablas Inactivas / Sin Uso (${summary.kpis.obsoleteCount})`);
  lines.push('');
  const obsolete = summary.tables.filter(t => t.classification === 'obsolete');
  if (obsolete.length === 0) {
    lines.push('_No se encontraron tablas inactivas. Todas presentan actividad de I/O._');
    lines.push('');
  } else {
    lines.push('| Esquema | Nombre de Tabla | Filas | Tamaño (MB) | Última Actividad | Diagnóstico |');
    lines.push('| :--- | :--- | :---: | :---: | :---: | :---: |');
    for (const t of obsolete.sort((a, b) => b.totalRows - a.totalRows)) {
      lines.push(`| \`${t.schemaName}\` | \`${t.tableName}\` | ${t.totalRows.toLocaleString()} | ${t.totalSizeMb.toFixed(2)} | _Sin actividad_ | 🔴 Candidata a Retiro |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 3. Tablas Solo Lectura
  lines.push(`## 3. Tablas Solo Lectura o Archivo (${summary.kpis.readOnlyCount})`);
  lines.push('');
  const readonly = summary.tables.filter(t => t.classification === 'readonly');
  if (readonly.length === 0) {
    lines.push('_No se identificaron tablas exclusivamente de solo lectura._');
    lines.push('');
  } else {
    lines.push('| Esquema | Nombre de Tabla | Filas | Lecturas Totales | Última Lectura | Diagnóstico |');
    lines.push('| :--- | :--- | :---: | :---: | :---: | :---: |');
    for (const t of readonly.sort((a, b) => b.totalReads - a.totalReads)) {
      const lastR = t.lastReadDate ? new Date(t.lastReadDate).toLocaleString() : 'N/D';
      lines.push(`| \`${t.schemaName}\` | \`${t.tableName}\` | ${t.totalRows.toLocaleString()} | ${t.totalReads.toLocaleString()} | ${lastR} | 🟡 Solo Lectura / Catálogo |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 4. Tablas Activas
  lines.push(`## 4. Tablas Activas Transaccionales (${summary.kpis.activeCount})`);
  lines.push('');
  const active = summary.tables.filter(t => t.classification === 'active');
  if (active.length === 0) {
    lines.push('_No se identificaron tablas con operaciones de escritura activas._');
    lines.push('');
  } else {
    lines.push('| Esquema | Nombre de Tabla | Filas | Lecturas | Escrituras | Última Lectura | Última Escritura |');
    lines.push('| :--- | :--- | :---: | :---: | :---: | :---: | :---: |');
    for (const t of active.sort((a, b) => (b.totalWrites + b.totalReads) - (a.totalWrites + a.totalReads))) {
      const lastR = t.lastReadDate ? new Date(t.lastReadDate).toLocaleString() : 'N/D';
      const lastW = t.lastWriteDate ? new Date(t.lastWriteDate).toLocaleString() : 'N/D';
      lines.push(`| \`${t.schemaName}\` | \`${t.tableName}\` | ${t.totalRows.toLocaleString()} | ${t.totalReads.toLocaleString()} | ${t.totalWrites.toLocaleString()} | ${lastR} | ${lastW} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## 5. Plan de Saneamiento Recomendado por DBA');
  lines.push('1. **Respaldos de Resguardo:** Para las tablas inactivas, generar un script BCP o volcado DDL + datos antes de su remoción.');
  lines.push('2. **Renombrado Preventivo:** Aplicar un patrón temporal (ej: `ALTER SCHEMA deprecated TRANSFER [schema].[table]`) durante 30 días para verificar si saltan excepciones en aplicaciones legacy no documentadas.');
  lines.push('3. **Optimización de Almacenamiento:** En tablas de solo lectura voluminosas, habilitar `PAGE COMPRESSION` para reducir huella de memoria RAM e I/O de disco.');

  return lines.join('\n');
}

/**
 * Genera un archivo CSV estándar para Excel o Power BI.
 */
export function generateCsvReport(summary: AuditSummary): string {
  const headers = [
    'BaseDeDatos',
    'Esquema',
    'Tabla',
    'Clasificacion',
    'TotalFilas',
    'TamanoMB',
    'TotalLecturas',
    'UserSeeks',
    'UserScans',
    'UserLookups',
    'TotalEscrituras',
    'UltimaLectura',
    'UltimaEscritura',
    'Servidor',
    'UptimeServidor'
  ];

  const escape = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows: string[] = [headers.join(',')];

  for (const t of summary.tables) {
    const classLabel = t.classification === 'active' 
      ? 'ACTIVA' 
      : t.classification === 'readonly' 
      ? 'SOLO_LECTURA' 
      : 'INACTIVA_SIN_USO';

    rows.push([
      escape(summary.databaseName),
      escape(t.schemaName),
      escape(t.tableName),
      escape(classLabel),
      escape(t.totalRows),
      escape(t.totalSizeMb.toFixed(2)),
      escape(t.totalReads),
      escape(t.totalSeeks),
      escape(t.totalScans),
      escape(t.totalLookups),
      escape(t.totalWrites),
      escape(t.lastReadDate || ''),
      escape(t.lastWriteDate || ''),
      escape(summary.serverInfo.serverName),
      escape(summary.uptimeFormatted)
    ].join(','));
  }

  return rows.join('\n');
}
