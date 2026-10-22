import { BaseDatabaseProvider } from './base-provider.ts';
import type {
  DatabaseEngine,
  DatabaseItem,
  ServerInfo,
  AuditSummary,
  TableMetric,
  TableDependencyDetail,
  ArchiveScriptOptions,
  DatabaseConnectionConfig,
} from '../types.ts';

/**
 * Proveedor para SQLite (Estructura lista para integración con driver better-sqlite3 / sqlite3).
 */
export class SqliteProvider extends BaseDatabaseProvider {
  readonly engine: DatabaseEngine = 'sqlite';

  constructor(_config?: string | DatabaseConnectionConfig) {
    super();
  }

  async connect(_config: DatabaseConnectionConfig | string): Promise<ServerInfo> {
    throw new Error('El proveedor SQLite está en el roadmap y se habilitará en la próxima versión.');
  }

  async listDatabases(): Promise<DatabaseItem[]> {
    throw new Error('El proveedor SQLite no está implementado aún.');
  }

  async getUptime(_dbName?: string): Promise<{
    startTime: string;
    uptimeDays: number;
    uptimeHours: number;
    uptimeMinutes: number;
    uptimeFormatted: string;
  }> {
    throw new Error('El proveedor SQLite no está implementado aún.');
  }

  async auditTables(_dbName: string, _thresholdDays?: number): Promise<AuditSummary> {
    throw new Error('El proveedor SQLite no está implementado aún.');
  }

  async getTableDependencies(_tableName: string, _dbName?: string): Promise<TableDependencyDetail[]> {
    throw new Error('El proveedor SQLite no está implementado aún.');
  }

  generateArchiveScript(_selectedTables: TableMetric[], _options?: ArchiveScriptOptions): string {
    throw new Error('El proveedor SQLite no está implementado aún.');
  }
}
