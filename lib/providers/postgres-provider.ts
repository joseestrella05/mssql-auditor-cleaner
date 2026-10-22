import pg, { type Pool, type PoolConfig } from 'pg';
import { BaseDatabaseProvider } from './base-provider.ts';
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

export interface ParsedPgConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl: boolean | { rejectUnauthorized: boolean };
}

/**
 * Normaliza cualquier formato de conexión (URI postgresql:// o pares Clave=Valor)
 * a una configuración limpia de conexión compatible con el driver `pg`.
 */
export function parsePostgresConfig(
  input: string | DatabaseConnectionConfig,
  overrideDatabase?: string
): ParsedPgConfig {
  if (typeof input !== 'string') {
    const isSsl = input.sslMode === 'require' || input.encrypt === true;
    return {
      host: input.host || 'localhost',
      port: Number(input.port) || 5432,
      user: input.user || 'postgres',
      password: input.password || '',
      database: overrideDatabase || input.database || 'postgres',
      ssl: isSsl ? { rejectUnauthorized: false } : false,
    };
  }

  const raw = input.trim();

  // Caso 1: URI estándar postgresql:// o postgres://
  if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) {
    try {
      const url = new URL(raw);
      const host = url.hostname || 'localhost';
      const port = url.port ? parseInt(url.port, 10) : 5432;
      const user = decodeURIComponent(url.username || 'postgres');
      const password = decodeURIComponent(url.password || '');
      const pathDb = url.pathname ? url.pathname.replace(/^\//, '') : '';
      const database = overrideDatabase || pathDb || 'postgres';
      const sslModeParam = url.searchParams.get('sslmode')?.toLowerCase();
      const isSsl = sslModeParam === 'require' || sslModeParam === 'verify-ca' || sslModeParam === 'verify-full';

      return {
        host,
        port,
        user,
        password,
        database,
        ssl: isSsl ? { rejectUnauthorized: false } : false,
      };
    } catch {
      // Fallback a parser de pares si la URL tiene caracteres especiales no escapados
    }
  }

  // Caso 2: Pares Clave=Valor (Host=...;Port=5432;Database=...;User=...;Password=...)
  const parts = raw.split(';').map(p => p.trim()).filter(Boolean);
  const map = new Map<string, string>();

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      const k = part.slice(0, eqIdx).trim().toLowerCase();
      const v = part.slice(eqIdx + 1).trim();
      map.set(k, v);
    }
  }

  const host = map.get('host') || map.get('server') || map.get('data source') || map.get('addr') || 'localhost';
  const port = parseInt(map.get('port') || '5432', 10) || 5432;
  const user = map.get('user') || map.get('username') || map.get('user id') || map.get('uid') || 'postgres';
  const password = map.get('password') || map.get('pwd') || '';
  const database = overrideDatabase || map.get('database') || map.get('initial catalog') || map.get('dbname') || 'postgres';
  
  const sslMode = (map.get('sslmode') || map.get('ssl mode') || map.get('ssl') || '').toLowerCase();
  const isSsl = sslMode === 'require' || sslMode === 'true' || sslMode === '1';

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  };
}

/**
 * Proveedor especializado para PostgreSQL utilizando el paquete oficial `pg`.
 */
export class PostgresProvider extends BaseDatabaseProvider {
  readonly engine: DatabaseEngine = 'postgres';
  private config: ParsedPgConfig;
  private rawConfig: string | DatabaseConnectionConfig;
  private serverInfoCache: ServerInfo | null = null;
  private pools: Map<string, Pool> = new Map();

  constructor(connectionStringOrConfig?: string | DatabaseConnectionConfig) {
    super();
    this.rawConfig = connectionStringOrConfig || 'postgresql://postgres@localhost:5432/postgres';
    this.config = connectionStringOrConfig 
      ? parsePostgresConfig(connectionStringOrConfig)
      : {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: '',
          database: 'postgres',
          ssl: false,
        };
  }

  /**
   * Obtiene o inicializa un Pool de conexiones para la base de datos especificada.
   */
  private getPool(overrideDatabase?: string): Pool {
    const targetDb = overrideDatabase || this.config.database || 'postgres';
    let pool = this.pools.get(targetDb);
    if (!pool) {
      const poolConfig: PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: targetDb,
        ssl: this.config.ssl,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 5,
      };
      pool = new pg.Pool(poolConfig);
      this.pools.set(targetDb, pool);
    }
    return pool;
  }

  private async executeQuery<T = any>(sql: string, params: any[] = [], overrideDatabase?: string): Promise<T[]> {
    const pool = this.getPool(overrideDatabase);
    const client = await pool.connect();
    try {
      const res = await client.query(sql, params);
      return res.rows as T[];
    } finally {
      client.release();
    }
  }

  async connect(config: DatabaseConnectionConfig | string): Promise<ServerInfo> {
    this.rawConfig = config;
    this.config = parsePostgresConfig(config);

    // Consulta de versión y detalles del servidor
    const rows = await this.executeQuery<{
      full_version: string;
      server_version: string;
    }>(
      `SELECT version() AS full_version, current_setting('server_version') AS server_version;`,
      [],
      this.config.database
    );

    const first = rows[0];
    const serverVersion = first?.server_version || 'PostgreSQL';

    this.serverInfoCache = {
      serverName: `${this.config.host}:${this.config.port}`,
      productVersion: serverVersion,
      edition: `PostgreSQL (v${serverVersion})`,
    };

    return this.serverInfoCache;
  }

  async listDatabases(): Promise<DatabaseItem[]> {
    const sql = `
      SELECT 
        datid AS database_id,
        datname AS name,
        pg_encoding_to_char(encoding) AS collation_name
      FROM pg_database 
      WHERE datistemplate = false 
        AND datallowconn = true
      ORDER BY datname ASC;
    `;

    const rows = await this.executeQuery<{
      database_id: number;
      name: string;
      collation_name: string;
    }>(sql, [], this.config.database);

    return rows.map(r => ({
      databaseId: Number(r.database_id),
      name: r.name,
      stateDesc: 'ONLINE',
      collationName: r.collation_name,
      compatibilityLevel: parseInt(this.serverInfoCache?.productVersion || '16', 10) || 16,
    }));
  }

  async getUptime(dbName?: string): Promise<{
    startTime: string;
    uptimeDays: number;
    uptimeHours: number;
    uptimeMinutes: number;
    uptimeFormatted: string;
  }> {
    const targetDb = dbName || this.config.database;
    const sql = `SELECT pg_postmaster_start_time() AS start_time;`;

    const rows = await this.executeQuery<{ start_time: Date }>(sql, [], targetDb);
    const startTime = rows[0]?.start_time ? new Date(rows[0].start_time) : new Date();

    return this.calculateUptime(startTime);
  }

  async auditTables(dbName: string, thresholdDays: number = 30): Promise<AuditSummary> {
    // 1. Obtener Info del Servidor
    let serverInfo = this.serverInfoCache;
    if (!serverInfo) {
      serverInfo = await this.connect(this.rawConfig);
    }

    // 2. Uptime del Motor
    const uptime = await this.getUptime(dbName);
    const now = new Date();

    // 3. Telemetría de tablas mediante pg_stat_user_tables y metadatos del catálogo
    const sql = `
      WITH fk_incoming AS (
        SELECT 
          c_tgt.oid AS target_relid,
          COUNT(con.oid) AS incoming_fk_count
        FROM pg_constraint con
        JOIN pg_class c_tgt ON c_tgt.oid = con.confrelid
        WHERE con.contype = 'f'
        GROUP BY c_tgt.oid
      ),
      view_deps AS (
        SELECT 
          vtu.table_schema,
          vtu.table_name,
          COUNT(DISTINCT (vtu.view_schema || '.' || vtu.view_name)) AS referencing_views_count
        FROM information_schema.view_table_usage vtu
        GROUP BY vtu.table_schema, vtu.table_name
      )
      SELECT 
        s.schemaname AS schema_name,
        s.relname AS table_name,
        s.relid,
        COALESCE(s.n_live_tup, 0) AS total_rows,
        ROUND(pg_total_relation_size(s.relid)::numeric / 1048576, 2) AS total_size_mb,
        ROUND(GREATEST(0, (pg_total_relation_size(s.relid) - pg_relation_size(s.relid) - pg_indexes_size(s.relid)))::numeric / 1048576, 2) AS lob_size_mb,
        COALESCE(s.idx_scan, 0) AS total_seeks,
        COALESCE(s.seq_scan, 0) AS total_scans,
        (COALESCE(s.n_tup_ins, 0) + COALESCE(s.n_tup_upd, 0) + COALESCE(s.n_tup_del, 0)) AS total_writes,
        GREATEST(s.last_seq_scan, s.last_idx_scan) AS last_read_date,
        GREATEST(s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze) AS last_write_date,
        COALESCE(fk.incoming_fk_count, 0) AS incoming_fk_count,
        COALESCE(vd.referencing_views_count, 0) AS referencing_objects_count
      FROM pg_stat_user_tables s
      LEFT JOIN fk_incoming fk ON fk.target_relid = s.relid
      LEFT JOIN view_deps vd ON vd.table_schema = s.schemaname AND vd.table_name = s.relname
      ORDER BY s.schemaname ASC, s.relname ASC;
    `;

    const rows = await this.executeQuery<{
      schema_name: string;
      table_name: string;
      relid: number;
      total_rows: number | string;
      total_size_mb: number | string;
      lob_size_mb: number | string;
      total_seeks: number | string;
      total_scans: number | string;
      total_writes: number | string;
      last_read_date: Date | null;
      last_write_date: Date | null;
      incoming_fk_count: number | string;
      referencing_objects_count: number | string;
    }>(sql, [], dbName);

    const tables: TableMetric[] = rows.map(row => {
      const seeks = Number(row.total_seeks) || 0;
      const scans = Number(row.total_scans) || 0;
      const lookups = 0; // Postgres no separa bookmark lookups de index scans
      const reads = seeks + scans;
      const writes = Number(row.total_writes) || 0;
      const rowsCount = Number(row.total_rows) || 0;

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

      let daysSinceLastActivity: number | null = null;
      let daysSinceLastRead: number | null = null;
      let daysSinceLastWrite: number | null = null;

      if (lastActivity) {
        const diffMs = Math.max(0, now.getTime() - lastActivity.getTime());
        daysSinceLastActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
      if (lastRead) {
        const diffMs = Math.max(0, now.getTime() - lastRead.getTime());
        daysSinceLastRead = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
      if (lastWrite) {
        const diffMs = Math.max(0, now.getTime() - lastWrite.getTime());
        daysSinceLastWrite = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      const incomingFkCount = Number(row.incoming_fk_count) || 0;
      const referencingObjectsCount = Number(row.referencing_objects_count) || 0;
      const dependenciesCount = incomingFkCount + referencingObjectsCount;

      const isSystemMetadata = 
        row.schema_name === 'information_schema' || 
        row.schema_name.startsWith('pg_');

      const classification: TableClassification = this.classifyTable(
        isSystemMetadata,
        reads,
        writes,
        rowsCount,
        daysSinceLastActivity,
        thresholdDays
      );

      return {
        schemaName: row.schema_name,
        tableName: row.table_name,
        fullName: `${row.schema_name}.${row.table_name}`,
        totalRows: rowsCount,
        hasRows: rowsCount > 0,
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
        daysSinceLastRead,
        daysSinceLastWrite,
        incomingFkCount,
        referencingObjectsCount,
        dependenciesCount,
        seekScanRatio: this.formatSeekScanRatio(seeks, scans),
        isSystemMetadata,
        classification,
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
      tables,
    };
  }

  async getTableDependencies(tableName: string, dbName?: string): Promise<TableDependencyDetail[]> {
    const targetDb = dbName || this.config.database;
    const parts = tableName.split('.');
    const schema = parts.length > 1 ? parts[0] : 'public';
    const table = parts.length > 1 ? parts[1] : parts[0];

    // Consultar tanto Foreign Keys entrantes como Vistas dependientes
    const sql = `
      SELECT 
        con.conname AS constraint_name,
        n_src.nspname AS referencing_schema,
        c_src.relname AS referencing_name,
        'FOREIGN KEY CONSTRAINT' AS object_type_desc,
        'FOREIGN_KEY' AS dependency_type,
        false AS is_schema_bound,
        ('Foreign Key "' || con.conname || '" desde "' || n_src.nspname || '"."' || c_src.relname || '"') AS details
      FROM pg_constraint con
      JOIN pg_class c_tgt ON c_tgt.oid = con.confrelid
      JOIN pg_namespace n_tgt ON n_tgt.oid = c_tgt.relnamespace
      JOIN pg_class c_src ON c_src.oid = con.conrelid
      JOIN pg_namespace n_src ON n_src.oid = c_src.relnamespace
      WHERE con.contype = 'f'
        AND n_tgt.nspname = $1
        AND c_tgt.relname = $2
      UNION ALL
      SELECT 
        ('VIEW_' || vtu.view_name) AS constraint_name,
        vtu.view_schema AS referencing_schema,
        vtu.view_name AS referencing_name,
        'VIEW' AS object_type_desc,
        'PROGRAMMABLE_OBJECT' AS dependency_type,
        false AS is_schema_bound,
        ('Vista dependiente "' || vtu.view_schema || '"."' || vtu.view_name || '"') AS details
      FROM information_schema.view_table_usage vtu
      WHERE vtu.table_schema = $1
        AND vtu.table_name = $2;
    `;

    const rows = await this.executeQuery<{
      constraint_name: string;
      referencing_schema: string;
      referencing_name: string;
      object_type_desc: string;
      dependency_type: 'FOREIGN_KEY' | 'PROGRAMMABLE_OBJECT';
      is_schema_bound: boolean;
      details: string;
    }>(sql, [schema, table], targetDb);

    return rows.map(r => ({
      tableFullName: tableName,
      dependencyType: r.dependency_type,
      constraintName: r.constraint_name,
      referencingSchema: r.referencing_schema,
      referencingName: r.referencing_name,
      objectTypeDesc: r.object_type_desc,
      isSchemaBound: Boolean(r.is_schema_bound),
      details: r.details,
    }));
  }

  generateArchiveScript(selectedTables: TableMetric[], options?: ArchiveScriptOptions): string {
    const targetSchema = options?.targetSchema || 'archive';
    const databaseName = options?.databaseName || this.config.database || 'postgres';
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const lines: string[] = [];
    lines.push('-- =================================================================');
    lines.push(`-- SCRIPT DE SANEAMIENTO Y ARCHIVADO SEGURO DE TABLAS (POSTGRESQL)`);
    lines.push(`-- Base de Datos: [${databaseName}]`);
    lines.push(`-- Generado el: ${nowStr} (Auditoría DBA Senior)`);
    lines.push(`-- Total de tablas a transferir: ${selectedTables.length}`);
    lines.push('-- =================================================================');
    lines.push(`\\c "${databaseName}";\n`);

    lines.push('-- 1. Asegurar la existencia del schema de aislamiento');
    lines.push(`CREATE SCHEMA IF NOT EXISTS "${targetSchema}";\n`);

    lines.push('-- 2. Transferencia atómica de tablas al schema de archivo');
    lines.push('BEGIN;');

    selectedTables.forEach((table) => {
      lines.push('');
      lines.push(`  -- ---------------------------------------------------------------`);
      lines.push(`  -- Tabla: "${table.schemaName}"."${table.tableName}" (${table.totalRows.toLocaleString()} filas, ${table.totalSizeMb.toFixed(2)} MB)`);
      lines.push(`  -- Ratio Seek/Scan: ${table.seekScanRatio} | Última actividad: ${table.daysSinceLastActivity !== null ? `hace ${table.daysSinceLastActivity} días` : 'Nunca'}`);
      
      if (table.incomingFkCount > 0) {
        lines.push(`  -- ⚠️ ADVERTENCIA: La tabla posee ${table.incomingFkCount} Foreign Keys entrantes.`);
        lines.push(`  -- En PostgreSQL, mover a otro esquema conserva las FKs activas.`);
        lines.push(`  -- Si desea desvincularlas de las tablas hijas, elimine las restricciones FK dependientes.`);
      }

      lines.push(`  -- ---------------------------------------------------------------`);
      lines.push(`  ALTER TABLE "${table.schemaName}"."${table.tableName}" SET SCHEMA "${targetSchema}";`);
      lines.push(`  COMMENT ON TABLE "${targetSchema}"."${table.tableName}" IS 'ArchivedAt: ${nowStr} | Reason: Aislamiento por auditoría de telemetría';`);
    });

    lines.push('');
    lines.push('COMMIT;');
    lines.push('');
    lines.push(`-- Verificación posterior de tablas archivadas:`);
    lines.push(`-- SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = '${targetSchema}';\n`);

    return lines.join('\n');
  }

  async getDataDictionary(tableFullNames: string[], dbName?: string): Promise<ColumnMetadata[]> {
    if (!tableFullNames || tableFullNames.length === 0) return [];
    const targetDb = dbName || this.config.database;

    const sql = `
      SELECT 
        c.table_schema AS schema_name,
        c.table_name AS table_name,
        c.ordinal_position AS column_id,
        c.column_name AS column_name,
        c.data_type AS data_type,
        COALESCE(c.character_maximum_length, c.character_octet_length, 0) AS max_length,
        COALESCE(c.numeric_precision, 0) AS precision,
        COALESCE(c.numeric_scale, 0) AS scale,
        (c.is_nullable = 'YES') AS is_nullable,
        (c.is_identity = 'YES' OR COALESCE(c.column_default, '') LIKE 'nextval%') AS is_identity,
        EXISTS (
          SELECT 1 
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name 
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = c.column_name
        ) AS is_primary_key,
        col_description(pgc.oid, c.ordinal_position) AS column_description
      FROM information_schema.columns c
      JOIN pg_namespace pgn ON pgn.nspname = c.table_schema
      JOIN pg_class pgc ON pgc.relname = c.table_name AND pgc.relnamespace = pgn.oid
      WHERE (c.table_schema || '.' || c.table_name) = ANY($1)
      ORDER BY c.table_schema ASC, c.table_name ASC, c.ordinal_position ASC;
    `;

    const rows = await this.executeQuery<{
      schema_name: string;
      table_name: string;
      column_id: number;
      column_name: string;
      data_type: string;
      max_length: number;
      precision: number;
      scale: number;
      is_nullable: boolean;
      is_identity: boolean;
      is_primary_key: boolean;
      column_description: string | null;
    }>(sql, [tableFullNames], targetDb);

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
      columnDescription: r.column_description || null,
    }));
  }

  async getForeignKeysForErd(dbName?: string): Promise<ForeignKeyRelationship[]> {
    const targetDb = dbName || this.config.database;

    const sql = `
      SELECT 
        con.conname AS fk_name,
        n_src.nspname AS parent_schema,
        c_src.relname AS parent_table,
        att_src.attname AS parent_column,
        n_tgt.nspname AS ref_schema,
        c_tgt.relname AS ref_table,
        att_tgt.attname AS ref_column
      FROM pg_constraint con
      JOIN pg_class c_src ON c_src.oid = con.conrelid
      JOIN pg_namespace n_src ON n_src.oid = c_src.relnamespace
      JOIN pg_class c_tgt ON c_tgt.oid = con.confrelid
      JOIN pg_namespace n_tgt ON n_tgt.oid = c_tgt.relnamespace
      JOIN pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
      JOIN pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
      WHERE con.contype = 'f'
      ORDER BY con.conname ASC;
    `;

    const rows = await this.executeQuery<{
      fk_name: string;
      parent_schema: string;
      parent_table: string;
      parent_column: string;
      ref_schema: string;
      ref_table: string;
      ref_column: string;
    }>(sql, [], targetDb);

    return rows.map(r => ({
      fkName: r.fk_name,
      parentSchema: r.parent_schema,
      parentTable: r.parent_table,
      parentColumn: r.parent_column,
      refSchema: r.ref_schema,
      refTable: r.ref_table,
      refColumn: r.ref_column,
    }));
  }

  async disconnect(): Promise<void> {
    for (const [_, pool] of this.pools.entries()) {
      await pool.end();
    }
    this.pools.clear();
  }
}
