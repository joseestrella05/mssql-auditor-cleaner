import type {
  DatabaseEngine,
  DatabaseItem,
  ServerInfo,
  AuditSummary,
  TableMetric,
  TableClassification,
  TableDependencyDetail,
  ColumnMetadata,
  ForeignKeyRelationship,
  ArchiveScriptOptions,
  DatabaseConnectionConfig,
} from '../types';

/**
 * Contrato unificado para todos los motores de base de datos soportados.
 * Define la API estandarizada que el backend y frontend consumen sin importar
 * si el motor subyacente es Microsoft SQL Server, PostgreSQL, MySQL o SQLite.
 */
export interface IDatabaseProvider {
  /**
   * Identificador del motor de base de datos
   */
  readonly engine: DatabaseEngine;

  /**
   * Establece o valida la conexión con el motor y devuelve información del servidor.
   * @param config Cadena de conexión (plana o URI) o estructura de configuración.
   */
  connect(config: DatabaseConnectionConfig | string): Promise<ServerInfo>;

  /**
   * Obtiene la lista de bases de datos disponibles y en línea en el motor.
   */
  listDatabases(): Promise<DatabaseItem[]>;

  /**
   * Obtiene el tiempo de actividad acumulado (uptime) del motor desde su último reinicio.
   */
  getUptime(dbName?: string): Promise<{
    startTime: string;
    uptimeDays: number;
    uptimeHours: number;
    uptimeMinutes: number;
    uptimeFormatted: string;
  }>;

  /**
   * Realiza la auditoría profunda de tablas para la base de datos indicada.
   * Devuelve métricas normalizadas bajo el contrato `TableMetric` (`TableAuditItem`).
   * @param dbName Nombre de la base de datos o catálogo.
   * @param thresholdDays Umbral de días de inactividad para clasificar como 'stale' (default 30).
   */
  auditTables(dbName: string, thresholdDays?: number): Promise<AuditSummary>;

  /**
   * Consulta las dependencias de una tabla (Foreign Keys entrantes y objetos programables).
   * @param tableName Nombre completo o calificado de la tabla (ej. 'public.users' o 'dbo.Clientes').
   * @param dbName Nombre de la base de datos activa.
   */
  getTableDependencies(tableName: string, dbName?: string): Promise<TableDependencyDetail[]>;

  /**
   * Genera el script DDL/DML de migración y aislamiento de tablas al esquema de archivo.
   * Específico para la sintaxis nativa de cada motor.
   * @param selectedTables Lista de tablas seleccionadas para archivado.
   * @param options Opciones adicionales (esquema destino, comentarios, etc.).
   */
  generateArchiveScript(selectedTables: TableMetric[], options?: ArchiveScriptOptions): string;

  /**
   * (Opcional) Obtiene metadatos de columnas y tipos para el diccionario de datos.
   */
  getDataDictionary?(tableFullNames: string[], dbName?: string): Promise<ColumnMetadata[]>;

  /**
   * (Opcional) Obtiene relaciones de Foreign Key para diagramado Mermaid ERD.
   */
  getForeignKeysForErd?(dbName?: string): Promise<ForeignKeyRelationship[]>;

  /**
   * Libera recursos y cierra conexiones activas o pools.
   */
  disconnect?(): Promise<void>;
}

/**
 * Clase base abstracta con utilidades compartidas de cálculo y normalización
 * para evitar redundancia entre proveedores específicos.
 */
export abstract class BaseDatabaseProvider implements IDatabaseProvider {
  abstract readonly engine: DatabaseEngine;

  abstract connect(config: DatabaseConnectionConfig | string): Promise<ServerInfo>;
  abstract listDatabases(): Promise<DatabaseItem[]>;
  abstract getUptime(dbName?: string): Promise<{
    startTime: string;
    uptimeDays: number;
    uptimeHours: number;
    uptimeMinutes: number;
    uptimeFormatted: string;
  }>;
  abstract auditTables(dbName: string, thresholdDays?: number): Promise<AuditSummary>;
  abstract getTableDependencies(tableName: string, dbName?: string): Promise<TableDependencyDetail[]>;
  abstract generateArchiveScript(selectedTables: TableMetric[], options?: ArchiveScriptOptions): string;

  /**
   * Calcula el uptime formateado a partir de una fecha de inicio del servicio.
   */
  protected calculateUptime(startTime: Date): {
    startTime: string;
    uptimeDays: number;
    uptimeHours: number;
    uptimeMinutes: number;
    uptimeFormatted: string;
  } {
    const now = new Date();
    const uptimeMs = Math.max(0, now.getTime() - startTime.getTime());
    const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const uptimeFormatted = `${uptimeDays} días, ${uptimeHours} hrs, ${uptimeMinutes} min`;

    return {
      startTime: startTime.toISOString(),
      uptimeDays,
      uptimeHours,
      uptimeMinutes,
      uptimeFormatted,
    };
  }

  /**
   * Determina la clasificación estándar de una tabla con base en telemetría de I/O y días sin actividad.
   */
  protected classifyTable(
    isSystemMetadata: boolean,
    reads: number,
    writes: number,
    rows: number,
    daysSinceLastActivity: number | null,
    thresholdDays: number = 30
  ): TableClassification {
    if (isSystemMetadata) {
      return 'metadata';
    }
    if (reads === 0 && writes === 0) {
      return 'obsolete';
    }
    if (daysSinceLastActivity !== null && daysSinceLastActivity >= thresholdDays) {
      return 'stale';
    }
    if (writes === 0 && (reads > 0 || rows > 0)) {
      return 'readonly';
    }
    return 'active';
  }

  /**
   * Formatea la proporción de lecturas por búsqueda puntual (Seek) vs escaneo completo (Scan).
   */
  protected formatSeekScanRatio(seeks: number, scans: number): string {
    const total = seeks + scans;
    if (total === 0) return 'NONE';
    const pct = ((seeks / total) * 100).toFixed(1);
    return `${pct}% Seek`;
  }

  /**
   * Calcula los KPIs consolidados normalizados para cualquier conjunto de métricas de tablas.
   */
  protected computeKpis(tables: TableMetric[]): AuditSummary['kpis'] {
    const totalTables = tables.length;
    const activeCount = tables.filter(t => t.classification === 'active').length;
    const readOnlyCount = tables.filter(t => t.classification === 'readonly').length;
    const staleCount = tables.filter(t => t.classification === 'stale').length;
    const obsoleteCount = tables.filter(t => t.classification === 'obsolete').length;
    const metadataCount = tables.filter(t => t.classification === 'metadata').length;
    const emptyTablesCount = tables.filter(t => t.totalRows === 0).length;

    const reclaimableSizeMb = tables
      .filter(t => t.classification === 'obsolete')
      .reduce((acc, t) => acc + t.totalSizeMb, 0);

    const tablesWithDependenciesCount = tables
      .filter(t => (t.classification === 'obsolete' || t.classification === 'stale') && t.dependenciesCount > 0)
      .length;

    const totalRows = tables.reduce((acc, t) => acc + t.totalRows, 0);
    const totalSizeMb = tables.reduce((acc, t) => acc + t.totalSizeMb, 0);
    const totalReads = tables.reduce((acc, t) => acc + t.totalReads, 0);
    const totalWrites = tables.reduce((acc, t) => acc + t.totalWrites, 0);

    const activePct = totalTables > 0 ? (activeCount / totalTables) * 100 : 0;
    const readOnlyPct = totalTables > 0 ? (readOnlyCount / totalTables) * 100 : 0;
    const stalePct = totalTables > 0 ? (staleCount / totalTables) * 100 : 0;
    const obsoletePct = totalTables > 0 ? (obsoleteCount / totalTables) * 100 : 0;

    return {
      totalTables,
      activeCount,
      activePct: Number(activePct.toFixed(1)),
      readOnlyCount,
      readOnlyPct: Number(readOnlyPct.toFixed(1)),
      staleCount,
      stalePct: Number(stalePct.toFixed(1)),
      obsoleteCount,
      obsoletePct: Number(obsoletePct.toFixed(1)),
      metadataCount,
      emptyTablesCount,
      reclaimableSizeMb: Number(reclaimableSizeMb.toFixed(2)),
      tablesWithDependenciesCount,
      totalRows,
      totalSizeMb: Number(totalSizeMb.toFixed(2)),
      totalReads,
      totalWrites,
    };
  }
}
