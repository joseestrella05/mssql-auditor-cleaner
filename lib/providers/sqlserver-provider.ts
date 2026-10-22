import msnodesql from 'msnodesqlv8';
import { BaseDatabaseProvider } from './base-provider.ts';
import { SQL_QUERIES } from '../sql-queries.ts';
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
} from '../types.ts';

/**
 * Normaliza y formatea la cadena de conexión para el driver nativo ODBC de Microsoft (msnodesqlv8).
 */
export function normalizeOdbcConnectionString(connStr: string, overrideDatabase?: string): string {
  const parts = connStr.split(';').map(p => p.trim()).filter(Boolean);
  const map = new Map<string, string>();

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      const k = part.slice(0, eqIdx).trim().toLowerCase();
      const v = part.slice(eqIdx + 1).trim();
      map.set(k, v);
    }
  }

  // Extraer servidor / host
  let server = map.get('server') || map.get('data source') || map.get('addr') || map.get('address') || 'localhost';
  if (server.toLowerCase().startsWith('tcp:')) {
    server = server.slice(4);
  }

  // Base de datos (con soporte de override)
  const database = overrideDatabase || map.get('database') || map.get('initial catalog') || 'master';

  // Driver ODBC instalado
  let driver = map.get('driver') || '{ODBC Driver 18 for SQL Server}';
  if (!driver.startsWith('{')) driver = `{${driver}}`;

  // Autenticación: Detectar si es Windows Auth o SQL Auth
  const user = map.get('user id') || map.get('uid') || map.get('user');
  const password = map.get('password') || map.get('pwd');
  const trustedConn = (map.get('trusted_connection') || '').toLowerCase();
  const intSec = (map.get('integrated security') || '').toLowerCase();

  const isWindowsAuth = 
    !user || 
    trustedConn === 'yes' || trustedConn === 'true' || trustedConn === '1' ||
    intSec === 'sspi' || intSec === 'true';

  const tokens: string[] = [
    `Driver=${driver}`,
    `Server=${server}`,
    `Database=${database}`,
    `TrustServerCertificate=Yes`
  ];

  if (isWindowsAuth) {
    tokens.push('Trusted_Connection=Yes');
  } else {
    tokens.push(`UID=${user}`);
    tokens.push(`PWD=${password || ''}`);
  }

  return tokens.join(';') + ';';
}

/**
 * Proveedor para Microsoft SQL Server utilizando el driver ODBC nativo msnodesqlv8.
 */
export class SqlServerProvider extends BaseDatabaseProvider {
  readonly engine: DatabaseEngine = 'sqlserver';
  private connectionString: string = '';
  private serverInfoCache: ServerInfo | null = null;

  constructor(connectionStringOrConfig?: string | DatabaseConnectionConfig) {
    super();
    if (connectionStringOrConfig) {
      if (typeof connectionStringOrConfig === 'string') {
        this.connectionString = connectionStringOrConfig;
      } else {
        this.connectionString = this.buildConnectionStringFromConfig(connectionStringOrConfig);
      }
    }
  }

  private buildConnectionStringFromConfig(config: DatabaseConnectionConfig): string {
    if (config.connectionString) return config.connectionString;
    const tokens: string[] = [
      `Server=${config.host || 'localhost'}`,
      `Database=${config.database || 'master'}`,
    ];
    if (config.authMode === 'windows') {
      tokens.push('Trusted_Connection=True');
    } else {
      tokens.push(`User Id=${config.user || 'sa'}`);
      tokens.push(`Password=${config.password || ''}`);
    }
    tokens.push(`Encrypt=${config.encrypt ? 'True' : 'False'}`);
    tokens.push(`TrustServerCertificate=${config.trustServerCertificate ? 'True' : 'False'}`);
    return tokens.join(';') + ';';
  }

  private queryAsync<T = any>(connectionString: string, sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      msnodesql.query(connectionString, sql, (err: any, rows: any) => {
        if (err) {
          return reject(err);
        }
        resolve((rows || []) as T[]);
      });
    });
  }

  async connect(config: DatabaseConnectionConfig | string): Promise<ServerInfo> {
    if (typeof config === 'string') {
      this.connectionString = config;
    } else {
      this.connectionString = this.buildConnectionStringFromConfig(config);
    }

    const odbcConnStr = normalizeOdbcConnectionString(this.connectionString, 'master');

    const serverRows = await this.queryAsync<{
      serverName: string;
      productVersion: string;
      edition: string;
    }>(odbcConnStr, SQL_QUERIES.GET_SERVER_INFO);

    const sRow = serverRows[0] || {
      serverName: 'SQL Server Instance',
      productVersion: '',
      edition: ''
    };

    this.serverInfoCache = {
      serverName: sRow.serverName || 'SQL Server',
      productVersion: sRow.productVersion || '',
      edition: sRow.edition || ''
    };

    return this.serverInfoCache;
  }

  async listDatabases(): Promise<DatabaseItem[]> {
    const odbcConnStr = normalizeOdbcConnectionString(this.connectionString, 'master');
    const dbRows = await this.queryAsync<{
      databaseId: number;
      name: string;
      stateDesc: string;
      collationName: string | null;
      compatibilityLevel: number;
    }>(odbcConnStr, SQL_QUERIES.GET_ONLINE_DATABASES);

    return dbRows.map(row => ({
      databaseId: row.databaseId,
      name: row.name,
      stateDesc: row.stateDesc,
      collationName: row.collationName,
      compatibilityLevel: row.compatibilityLevel
    }));
  }

  async getUptime(dbName: string = 'master'): Promise<{
    startTime: string;
    uptimeDays: number;
    uptimeHours: number;
    uptimeMinutes: number;
    uptimeFormatted: string;
  }> {
    const odbcConnStr = normalizeOdbcConnectionString(this.connectionString, dbName);
    const startRows = await this.queryAsync<{
      sqlServerStartTime: Date;
    }>(odbcConnStr, SQL_QUERIES.GET_ENGINE_START_TIME);

    const startTime = startRows[0]?.sqlServerStartTime 
      ? new Date(startRows[0].sqlServerStartTime) 
      : new Date();

    return this.calculateUptime(startTime);
  }

  async auditTables(dbName: string, thresholdDays: number = 30): Promise<AuditSummary> {
    const odbcConnStr = normalizeOdbcConnectionString(this.connectionString, dbName);

    // 1. Info del Servidor
    let serverInfo = this.serverInfoCache;
    if (!serverInfo) {
      serverInfo = await this.connect(this.connectionString);
    }

    // 2. Uptime del Motor
    const uptime = await this.getUptime(dbName);
    const now = new Date();

    // 3. Telemetría de tablas
    const tableRows = await this.queryAsync<{
      schema_name: string;
      table_name: string;
      total_rows: number | string;
      total_size_mb: number | string;
      lob_size_mb: number | string;
      total_seeks: number | string;
      total_scans: number | string;
      total_lookups: number | string;
      total_updates: number | string;
      last_read_date: Date | null;
      last_write_date: Date | null;
      days_since_last_read: number | null;
      days_since_last_write: number | null;
      days_since_last_activity: number | null;
      incoming_fk_count: number | string;
      referencing_objects_count: number | string;
      dependencies_count: number | string;
      seek_scan_ratio: string;
      is_system_metadata: number | string;
    }>(odbcConnStr, SQL_QUERIES.AUDIT_TABLE_USAGE);

    const tables: TableMetric[] = tableRows.map(row => {
      const seeks = Number(row.total_seeks) || 0;
      const scans = Number(row.total_scans) || 0;
      const lookups = Number(row.total_lookups) || 0;
      const reads = seeks + scans + lookups;
      const writes = Number(row.total_updates) || 0;
      const rows = Number(row.total_rows) || 0;

      const lastRead = row.last_read_date ? new Date(row.last_read_date) : null;
      const lastWrite = row.last_write_date ? new Date(row.last_write_date) : null;

      let lastActivity: Date | null = null;
      if (lastRead && lastWrite) {
        lastActivity = lastRead.getTime() > lastWrite.getTime() ? lastRead : lastWrite;
      } else if (lastRead) {
        lastActivity = lastRead;
      } else if (lastWrite) {
        lastActivity = lastWrite;
      }

      let daysSinceLastActivity = row.days_since_last_activity !== null ? Number(row.days_since_last_activity) : null;
      if (daysSinceLastActivity === null && lastActivity) {
        const diffMs = Math.max(0, now.getTime() - lastActivity.getTime());
        daysSinceLastActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      const incomingFkCount = Number(row.incoming_fk_count) || 0;
      const referencingObjectsCount = Number(row.referencing_objects_count) || 0;
      const dependenciesCount = Number(row.dependencies_count) || (incomingFkCount + referencingObjectsCount);
      const isSystemMetadata = Number(row.is_system_metadata) === 1;

      const classification: TableClassification = this.classifyTable(
        isSystemMetadata,
        reads,
        writes,
        rows,
        daysSinceLastActivity,
        thresholdDays
      );

      return {
        schemaName: row.schema_name,
        tableName: row.table_name,
        fullName: `${row.schema_name}.${row.table_name}`,
        totalRows: rows,
        hasRows: rows > 0,
        totalSizeMb: Number(Number(row.total_size_mb || 0).toFixed(2)),
        lobSizeMb: Number(Number(row.lob_size_mb || 0).toFixed(2)),
        totalReads: reads,
        totalSeeks: seeks,
        totalScans: scans,
        totalLookups: lookups,
        totalWrites: writes,
        lastReadDate: lastRead ? lastRead.toISOString() : null,
        lastWriteDate: lastWrite ? lastWrite.toISOString() : null,
        lastActivityDate: lastActivity ? lastActivity.toISOString() : null,
        daysSinceLastActivity,
        daysSinceLastRead: row.days_since_last_read !== null ? Number(row.days_since_last_read) : null,
        daysSinceLastWrite: row.days_since_last_write !== null ? Number(row.days_since_last_write) : null,
        incomingFkCount,
        referencingObjectsCount,
        dependenciesCount,
        seekScanRatio: row.seek_scan_ratio || this.formatSeekScanRatio(seeks, scans),
        isSystemMetadata,
        classification
      };
    });

    const kpis = this.computeKpis(tables);

    return {
      serverInfo,
      databaseName: dbName,
      sqlServerStartTime: uptime.startTime,
      uptimeDays: uptime.uptimeDays,
      uptimeHours: uptime.uptimeHours,
      uptimeMinutes: uptime.uptimeMinutes,
      uptimeFormatted: uptime.uptimeFormatted,
      auditedAt: now.toISOString(),
      kpis,
      tables
    };
  }

  async getTableDependencies(tableName: string, dbName: string = 'master'): Promise<TableDependencyDetail[]> {
    const odbcConnStr = normalizeOdbcConnectionString(this.connectionString, dbName);
    const safeTableName = tableName.replace(/'/g, "''");
    
    const sql = `
      DECLARE @tableFullName NVARCHAR(260) = N'${safeTableName}';
      ${SQL_QUERIES.GET_TABLE_DEPENDENCY_DETAILS}
    `;

    const rows = await this.queryAsync<{
      dependency_type: 'FOREIGN_KEY' | 'PROGRAMMABLE_OBJECT';
      constraint_name: string;
      referencing_schema: string;
      referencing_name: string;
      object_type_desc: string;
      is_schema_bound: number | boolean;
      details: string;
    }>(odbcConnStr, sql);

    return rows.map(r => ({
      tableFullName: tableName,
      dependencyType: r.dependency_type,
      constraintName: r.constraint_name,
      referencingSchema: r.referencing_schema,
      referencingName: r.referencing_name,
      objectTypeDesc: r.object_type_desc,
      isSchemaBound: Number(r.is_schema_bound) === 1,
      details: r.details
    }));
  }

  generateArchiveScript(selectedTables: TableMetric[], options?: ArchiveScriptOptions): string {
    const targetSchema = options?.targetSchema || 'archive';
    const databaseName = options?.databaseName || 'master';
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const lines: string[] = [];
    lines.push('-- =================================================================');
    lines.push(`-- SCRIPT DE SANEAMIENTO Y ARCHIVADO SEGURO DE TABLAS (SQL SERVER)`);
    lines.push(`-- Base de Datos: [${databaseName}]`);
    lines.push(`-- Generado el: ${nowStr} (Auditoría DBA Senior)`);
    lines.push(`-- Total de tablas a transferir: ${selectedTables.length}`);
    lines.push('-- =================================================================');
    lines.push(`USE [${databaseName}];`);
    lines.push('GO\n');

    lines.push('-- 1. Asegurar existencia del esquema de aislamiento/archivo');
    lines.push(`IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '${targetSchema}')`);
    lines.push(`BEGIN`);
    lines.push(`    EXEC('CREATE SCHEMA [${targetSchema}]');`);
    lines.push(`    PRINT 'Esquema [${targetSchema}] creado exitosamente.';`);
    lines.push(`END`);
    lines.push('GO\n');

    lines.push('-- 2. Transferencia segura de esquemas y documentación de metadatos');
    lines.push('BEGIN TRANSACTION;');
    lines.push('BEGIN TRY');

    selectedTables.forEach((table) => {
      lines.push('');
      lines.push(`    -- -------------------------------------------------------------`);
      lines.push(`    -- Tabla: [${table.schemaName}].[${table.tableName}] (${table.totalRows.toLocaleString()} filas, ${table.totalSizeMb.toFixed(2)} MB, LOBs: ${table.lobSizeMb || 0} MB)`);
      lines.push(`    -- Ratio Seek/Scan: ${table.seekScanRatio || 'N/A'} | Última actividad: ${table.daysSinceLastActivity !== null ? `hace ${table.daysSinceLastActivity} días` : 'Nunca'}`);
      
      if (table.incomingFkCount > 0) {
        lines.push(`    -- ⚠️ ADVERTENCIA: Posee ${table.incomingFkCount} Foreign Keys entrantes.`);
      }

      lines.push(`    -- -------------------------------------------------------------`);
      lines.push(`    ALTER SCHEMA [${targetSchema}] TRANSFER [${table.schemaName}].[${table.tableName}];`);
      lines.push(`    EXEC sys.sp_addextendedproperty `);
      lines.push(`        @name = N'ArchivedAt', `);
      lines.push(`        @value = N'${nowStr}', `);
      lines.push(`        @level0type = N'SCHEMA', @level0name = N'${targetSchema}', `);
      lines.push(`        @level1type = N'TABLE', @level1name = N'${table.tableName}';`);
      lines.push(`    EXEC sys.sp_addextendedproperty `);
      lines.push(`        @name = N'ArchiveReason', `);
      lines.push(`        @value = N'Identificada como obsoleta/estancada por auditoría de telemetría de índices', `);
      lines.push(`        @level0type = N'SCHEMA', @level0name = N'${targetSchema}', `);
      lines.push(`        @level1type = N'TABLE', @level1name = N'${table.tableName}';`);
    });

    lines.push('');
    lines.push('    COMMIT TRANSACTION;');
    lines.push(`    PRINT 'Transferencia de ${selectedTables.length} tablas al esquema [${targetSchema}] completada con éxito.';`);
    lines.push('END TRY');
    lines.push('BEGIN CATCH');
    lines.push('    ROLLBACK TRANSACTION;');
    lines.push(`    PRINT 'ERROR en la transferencia: ' + ERROR_MESSAGE();`);
    lines.push('    THROW;');
    lines.push('END CATCH;');
    lines.push('GO\n');

    return lines.join('\n');
  }

  async getDataDictionary(tableFullNames: string[], dbName: string = 'master'): Promise<ColumnMetadata[]> {
    if (!tableFullNames || tableFullNames.length === 0) return [];
    const odbcConnStr = normalizeOdbcConnectionString(this.connectionString, dbName);
    
    const inClause = tableFullNames
      .map(name => `'${name.replace(/'/g, "''")}'`)
      .join(', ');

    const sql = `
      SELECT 
        s.name AS schema_name,
        t.name AS table_name,
        c.column_id,
        c.name AS column_name,
        tp.name AS data_type,
        c.max_length,
        c.precision,
        c.scale,
        c.is_nullable,
        c.is_identity,
        ISNULL(pk.is_primary_key, 0) AS is_primary_key,
        CAST(ep.value AS NVARCHAR(500)) AS column_description
      FROM sys.tables t WITH (NOLOCK)
      INNER JOIN sys.schemas s WITH (NOLOCK) ON t.schema_id = s.schema_id
      INNER JOIN sys.columns c WITH (NOLOCK) ON t.object_id = c.object_id
      INNER JOIN sys.types tp WITH (NOLOCK) ON c.user_type_id = tp.user_type_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id, 1 AS is_primary_key
        FROM sys.index_columns ic WITH (NOLOCK)
        INNER JOIN sys.indexes i WITH (NOLOCK) 
          ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_primary_key = 1
      ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
      LEFT JOIN sys.extended_properties ep WITH (NOLOCK) 
        ON ep.major_id = t.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
      WHERE t.is_ms_shipped = 0
        AND (s.name + '.' + t.name) IN (${inClause})
      ORDER BY s.name ASC, t.name ASC, c.column_id ASC;
    `;

    const rows = await this.queryAsync<{
      schema_name: string;
      table_name: string;
      column_id: number;
      column_name: string;
      data_type: string;
      max_length: number;
      precision: number;
      scale: number;
      is_nullable: boolean | number;
      is_identity: boolean | number;
      is_primary_key: boolean | number;
      column_description: string | null;
    }>(odbcConnStr, sql);

    return rows.map(r => ({
      schemaName: r.schema_name,
      tableName: r.table_name,
      columnId: Number(r.column_id),
      columnName: r.column_name,
      dataType: r.data_type,
      maxLength: Number(r.max_length),
      precision: Number(r.precision),
      scale: Number(r.scale),
      isNullable: Boolean(r.is_nullable),
      isIdentity: Boolean(r.is_identity),
      isPrimaryKey: Boolean(r.is_primary_key),
      columnDescription: r.column_description || null
    }));
  }

  async getForeignKeysForErd(dbName: string = 'master'): Promise<ForeignKeyRelationship[]> {
    const odbcConnStr = normalizeOdbcConnectionString(this.connectionString, dbName);
    const rows = await this.queryAsync<{
      fk_name: string;
      parent_schema: string;
      parent_table: string;
      parent_column: string;
      ref_schema: string;
      ref_table: string;
      ref_column: string;
    }>(odbcConnStr, SQL_QUERIES.GET_FOREIGN_KEYS_FOR_ERD);

    return rows.map(r => ({
      fkName: r.fk_name,
      parentSchema: r.parent_schema,
      parentTable: r.parent_table,
      parentColumn: r.parent_column,
      refSchema: r.ref_schema,
      refTable: r.ref_table,
      refColumn: r.ref_column
    }));
  }
}
