import msnodesql from 'msnodesqlv8';
import { SQL_QUERIES } from './sql-queries';
import type { 
  AuditSummary, 
  DatabaseItem, 
  ServerInfo, 
  TableClassification, 
  TableMetric,
  TableDependencyDetail,
  ColumnMetadata,
  ForeignKeyRelationship
} from './types';

/**
 * Normaliza y formatea la cadena de conexión para el driver nativo ODBC de Microsoft (msnodesqlv8).
 * Resuelve automáticamente:
 * 1. Instancias con nombre (ej: NP26-SOPORTE\SQLEXPRESS, localhost\SQLEXPRESS).
 * 2. Conexiones por Memoria Compartida (LPC) cuando TCP/IP está deshabilitado en SQL Express.
 * 3. Autenticación Integrada de Windows (Trusted_Connection=Yes / SSPI).
 * 4. Certificados autofirmados (TrustServerCertificate=Yes).
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

  // Base de datos (con soporte de override para cambiar de contexto en memoria)
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
 * Ejecuta una consulta SQL en la base de datos a través del driver nativo ODBC de Microsoft.
 */
function queryAsync<T = any>(connectionString: string, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    msnodesql.query(connectionString, sql, (err: any, rows: any) => {
      if (err) {
        return reject(err);
      }
      resolve((rows || []) as T[]);
    });
  });
}

/**
 * Prueba la conectividad contra la instancia y consulta las bases de datos en línea.
 */
export async function testConnectionAndFetchDatabases(connStr: string): Promise<{
  serverInfo: ServerInfo;
  databases: DatabaseItem[];
}> {
  const odbcConnStr = normalizeOdbcConnectionString(connStr, 'master');

  // 1. Obtener Info del Servidor
  const serverRows = await queryAsync<{
    serverName: string;
    productVersion: string;
    edition: string;
  }>(odbcConnStr, SQL_QUERIES.GET_SERVER_INFO);

  const sRow = serverRows[0] || {
    serverName: 'SQL Server Instance',
    productVersion: '',
    edition: ''
  };

  const serverInfo: ServerInfo = {
    serverName: sRow.serverName || 'SQL Server',
    productVersion: sRow.productVersion || '',
    edition: sRow.edition || ''
  };

  // 2. Obtener Bases de Datos ONLINE
  const dbRows = await queryAsync<{
    databaseId: number;
    name: string;
    stateDesc: string;
    collationName: string | null;
    compatibilityLevel: number;
  }>(odbcConnStr, SQL_QUERIES.GET_ONLINE_DATABASES);

  const databases: DatabaseItem[] = dbRows.map(row => ({
    databaseId: row.databaseId,
    name: row.name,
    stateDesc: row.stateDesc,
    collationName: row.collationName,
    compatibilityLevel: row.compatibilityLevel
  }));

  return { serverInfo, databases };
}

/**
 * Ejecuta la auditoría profunda de la base de datos seleccionada con dependencias y particiones.
 */
export async function auditDatabase(connStr: string, databaseName: string): Promise<AuditSummary> {
  const odbcConnStr = normalizeOdbcConnectionString(connStr, databaseName);

  // 1. Obtener Info del Servidor
  const serverRows = await queryAsync<{
    serverName: string;
    productVersion: string;
    edition: string;
  }>(odbcConnStr, SQL_QUERIES.GET_SERVER_INFO);

  const sRow = serverRows[0] || {
    serverName: 'SQL Server Instance',
    productVersion: '',
    edition: ''
  };

  const serverInfo: ServerInfo = {
    serverName: sRow.serverName || 'SQL Server',
    productVersion: sRow.productVersion || '',
    edition: sRow.edition || ''
  };

  // 2. Obtener Uptime del Motor
  const startRows = await queryAsync<{
    sqlServerStartTime: Date;
  }>(odbcConnStr, SQL_QUERIES.GET_ENGINE_START_TIME);

  const startTime = startRows[0]?.sqlServerStartTime 
    ? new Date(startRows[0].sqlServerStartTime) 
    : new Date();

  const now = new Date();
  const uptimeMs = Math.max(0, now.getTime() - startTime.getTime());
  const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
  const uptimeFormatted = `${uptimeDays} días, ${uptimeHours} hrs, ${uptimeMinutes} min`;

  // 3. Ejecutar consulta de telemetría de tablas
  const tableRows = await queryAsync<{
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

    // Utilizar cálculo SQL de días transcurridos o fallback a JS
    let daysSinceLastActivity = row.days_since_last_activity !== null ? Number(row.days_since_last_activity) : null;
    if (daysSinceLastActivity === null && lastActivity) {
      const diffMs = Math.max(0, now.getTime() - lastActivity.getTime());
      daysSinceLastActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    const incomingFkCount = Number(row.incoming_fk_count) || 0;
    const referencingObjectsCount = Number(row.referencing_objects_count) || 0;
    const dependenciesCount = Number(row.dependencies_count) || (incomingFkCount + referencingObjectsCount);
    const isSystemMetadata = Number(row.is_system_metadata) === 1;

    let classification: TableClassification = 'active';

    if (isSystemMetadata) {
      classification = 'metadata';
    } else if (reads === 0 && writes === 0) {
      classification = 'obsolete';
    } else if (daysSinceLastActivity !== null && daysSinceLastActivity >= 30) {
      // Tuvo lecturas en el pasado, pero hace más de 30 días que nadie la consulta
      classification = 'stale';
    } else if (writes === 0 && (reads > 0 || rows > 0)) {
      classification = 'readonly';
    } else {
      classification = 'active';
    }

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
      seekScanRatio: row.seek_scan_ratio || 'NONE',
      isSystemMetadata,
      classification
    };
  });

  // 4. Calcular KPIs consolidados
  const totalTables = tables.length;
  const activeCount = tables.filter(t => t.classification === 'active').length;
  const readOnlyCount = tables.filter(t => t.classification === 'readonly').length;
  const staleCount = tables.filter(t => t.classification === 'stale').length;
  const obsoleteCount = tables.filter(t => t.classification === 'obsolete').length;
  const metadataCount = tables.filter(t => t.classification === 'metadata').length;
  const emptyTablesCount = tables.filter(t => t.totalRows === 0).length;

  // Espacio recuperable: suma de tamaño de tablas con 0 I/O
  const reclaimableSizeMb = tables
    .filter(t => t.classification === 'obsolete')
    .reduce((acc, t) => acc + t.totalSizeMb, 0);

  // Tablas en desuso o estancadas que tienen dependencias (FKs o vistas/SPs)
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
    serverInfo,
    databaseName,
    sqlServerStartTime: startTime.toISOString(),
    uptimeDays,
    uptimeHours,
    uptimeMinutes,
    uptimeFormatted,
    auditedAt: now.toISOString(),
    kpis: {
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
      totalWrites
    },
    tables
  };
}

/**
 * Obtiene el detalle de dependencias por nombre para una tabla específica
 * (Foreign Keys entrantes, vistas, SPs, funciones, triggers y Schemabinding).
 */
export async function getTableDependencies(
  connStr: string, 
  databaseName: string, 
  tableFullName: string
): Promise<TableDependencyDetail[]> {
  const odbcConnStr = normalizeOdbcConnectionString(connStr, databaseName);
  const safeTableName = tableFullName.replace(/'/g, "''");
  
  const sql = `
    DECLARE @tableFullName NVARCHAR(260) = N'${safeTableName}';
    ${SQL_QUERIES.GET_TABLE_DEPENDENCY_DETAILS}
  `;

  const rows = await queryAsync<{
    dependency_type: 'FOREIGN_KEY' | 'PROGRAMMABLE_OBJECT';
    constraint_name: string;
    referencing_schema: string;
    referencing_name: string;
    object_type_desc: string;
    is_schema_bound: number | boolean;
    details: string;
  }>(odbcConnStr, sql);

  return rows.map(r => ({
    tableFullName,
    dependencyType: r.dependency_type,
    constraintName: r.constraint_name,
    referencingSchema: r.referencing_schema,
    referencingName: r.referencing_name,
    objectTypeDesc: r.object_type_desc,
    isSchemaBound: Number(r.is_schema_bound) === 1,
    details: r.details
  }));
}

/**
 * Obtiene el diccionario de datos para una lista de tablas seleccionadas
 * (columnas, tipos, longitud, nulabilidad, PK y extended properties).
 */
export async function getDataDictionary(
  connStr: string,
  databaseName: string,
  tableFullNames: string[]
): Promise<ColumnMetadata[]> {
  if (!tableFullNames || tableFullNames.length === 0) return [];
  
  const odbcConnStr = normalizeOdbcConnectionString(connStr, databaseName);
  
  // Si son pocas o una sola tabla, podemos filtrar con IN (...)
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

  const rows = await queryAsync<{
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

/**
 * Obtiene las relaciones de claves foráneas entre tablas de la base de datos para generar Mermaid ERD.
 */
export async function getForeignKeysForErd(
  connStr: string,
  databaseName: string
): Promise<ForeignKeyRelationship[]> {
  const odbcConnStr = normalizeOdbcConnectionString(connStr, databaseName);
  const rows = await queryAsync<{
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

