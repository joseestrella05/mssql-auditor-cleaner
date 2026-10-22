export type DatabaseEngine = 'sqlserver' | 'postgres' | 'mysql' | 'sqlite';

export type TableClassification = 'active' | 'readonly' | 'stale' | 'obsolete' | 'metadata';

export interface TableMetric {
  schemaName: string;
  tableName: string;
  fullName: string;
  totalRows: number;
  hasRows: boolean;
  totalSizeMb: number;
  lobSizeMb: number;
  totalReads: number;
  totalSeeks: number;
  totalScans: number;
  totalLookups: number;
  totalWrites: number;
  lastReadDate: string | null;
  lastWriteDate: string | null;
  lastActivityDate: string | null;
  daysSinceLastActivity: number | null;
  daysSinceLastRead: number | null;
  daysSinceLastWrite: number | null;
  incomingFkCount: number;
  referencingObjectsCount: number;
  dependenciesCount: number;
  seekScanRatio: string;
  isSystemMetadata: boolean;
  classification: TableClassification;
  isPersistentZeroIo?: boolean;
}

/**
 * Contrato TypeScript unificado estándar para auditoría de tablas en todos los motores
 */
export type TableAuditItem = TableMetric;

export interface DatabaseItem {
  databaseId: number;
  name: string;
  stateDesc: string;
  collationName: string | null;
  compatibilityLevel: number;
}

export interface ServerInfo {
  serverName: string;
  productVersion: string;
  edition: string;
}

export interface AuditSummary {
  serverInfo: ServerInfo;
  databaseName: string;
  sqlServerStartTime: string;
  uptimeDays: number;
  uptimeHours: number;
  uptimeMinutes: number;
  uptimeFormatted: string;
  auditedAt: string;
  kpis: {
    totalTables: number;
    activeCount: number;
    activePct: number;
    readOnlyCount: number;
    readOnlyPct: number;
    staleCount: number;
    stalePct: number;
    obsoleteCount: number;
    obsoletePct: number;
    metadataCount: number;
    emptyTablesCount: number;
    reclaimableSizeMb: number;
    tablesWithDependenciesCount: number;
    totalRows: number;
    totalSizeMb: number;
    totalReads: number;
    totalWrites: number;
  };
  tables: TableMetric[];
}

export interface SavedConnectionProfile {
  id: string;
  name: string;
  engine?: DatabaseEngine;
  server: string;
  port?: number;
  database?: string;
  authMode: 'windows' | 'sql';
  user?: string;
  sslMode?: 'disable' | 'require';
  encrypt: boolean;
  trustServerCertificate: boolean;
  createdAt: string;
}

export interface ArchiveScriptOptions {
  targetSchema?: string;
  databaseName?: string;
  includeComments?: boolean;
}

export interface DatabaseConnectionConfig {
  engine: DatabaseEngine;
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  sslMode?: 'disable' | 'require';
  authMode?: 'windows' | 'sql';
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface TableDependencyDetail {
  tableFullName?: string;
  dependencyType: 'FOREIGN_KEY' | 'PROGRAMMABLE_OBJECT';
  constraintName: string;
  referencingSchema: string;
  referencingName: string;
  objectTypeDesc: string;
  isSchemaBound: boolean;
  details: string;
}

export interface ColumnMetadata {
  schemaName: string;
  tableName: string;
  columnId: number;
  columnName: string;
  dataType: string;
  maxLength: number;
  precision: number;
  scale: number;
  isNullable: boolean;
  isIdentity: boolean;
  isPrimaryKey: boolean;
  columnDescription: string | null;
}

export interface ForeignKeyRelationship {
  fkName: string;
  parentSchema: string;
  parentTable: string;
  parentColumn: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
}

export interface SnapshotMetadata {
  databaseName: string;
  serverInstance: string;
  createdAt: string;
  uptimeStartTime: string;
  totalTablesCount: number;
}

export interface AuditSnapshot {
  version: string;
  metadata?: SnapshotMetadata;
  // Campos heredados / fallback para compatibilidad con snapshots previos
  snapshotDate?: string;
  databaseName?: string;
  serverName?: string;
  sqlServerStartTime?: string;
  tables: Array<{
    fullName: string;
    schemaName: string;
    tableName: string;
    totalRows: number;
    totalSizeMb: number;
    totalReads: number;
    totalWrites: number;
    lastActivityDate: string | null;
    classification: TableClassification;
  }>;
}

export interface SnapshotComparisonResult {
  previousDate: string;
  currentDate: string;
  previousTableCount: number;
  currentTableCount: number;
  persistentZeroIoTables: string[];
  rowsChangedTables: Array<{
    fullName: string;
    previousRows: number;
    currentRows: number;
    rowDelta: number;
  }>;
  sizeChangedTables: Array<{
    fullName: string;
    previousSizeMb: number;
    currentSizeMb: number;
    sizeDeltaMb: number;
  }>;
  newTables: string[];
  removedTables: string[];
}
