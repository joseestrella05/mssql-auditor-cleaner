import { getDatabaseProvider } from './providers/index.ts';
import type {
  AuditSummary,
  DatabaseEngine,
  DatabaseItem,
  ServerInfo,
  TableMetric,
  TableDependencyDetail,
  ColumnMetadata,
  ForeignKeyRelationship,
} from './types.ts';

export { normalizeOdbcConnectionString } from './providers/sqlserver-provider.ts';

/**
 * Prueba la conectividad contra la instancia y consulta las bases de datos en línea.
 * Soporta múltiples motores relacionales delegando en el proveedor correspondiente.
 */
export async function testConnectionAndFetchDatabases(
  connStr: string,
  engine: DatabaseEngine = 'sqlserver'
): Promise<{
  serverInfo: ServerInfo;
  databases: DatabaseItem[];
}> {
  const provider = getDatabaseProvider(engine, connStr);
  const serverInfo = await provider.connect(connStr);
  const databases = await provider.listDatabases();
  return { serverInfo, databases };
}

/**
 * Ejecuta la auditoría profunda de la base de datos seleccionada con telemetría de I/O y dependencias.
 */
export async function auditDatabase(
  connStr: string,
  databaseName: string,
  engine: DatabaseEngine = 'sqlserver',
  thresholdDays: number = 30
): Promise<AuditSummary> {
  const provider = getDatabaseProvider(engine, connStr);
  await provider.connect(connStr);
  return await provider.auditTables(databaseName, thresholdDays);
}

/**
 * Obtiene el detalle de dependencias por nombre para una tabla específica.
 */
export async function getTableDependencies(
  connStr: string,
  databaseName: string,
  tableFullName: string,
  engine: DatabaseEngine = 'sqlserver'
): Promise<TableDependencyDetail[]> {
  const provider = getDatabaseProvider(engine, connStr);
  await provider.connect(connStr);
  return await provider.getTableDependencies(tableFullName, databaseName);
}

/**
 * Obtiene el diccionario de datos para una lista de tablas seleccionadas.
 */
export async function getDataDictionary(
  connStr: string,
  databaseName: string,
  tableFullNames: string[],
  engine: DatabaseEngine = 'sqlserver'
): Promise<ColumnMetadata[]> {
  if (!tableFullNames || tableFullNames.length === 0) return [];
  const provider = getDatabaseProvider(engine, connStr);
  await provider.connect(connStr);
  if (provider.getDataDictionary) {
    return await provider.getDataDictionary(tableFullNames, databaseName);
  }
  return [];
}

/**
 * Obtiene las relaciones de claves foráneas entre tablas de la base de datos para generar Mermaid ERD.
 */
export async function getForeignKeysForErd(
  connStr: string,
  databaseName: string,
  engine: DatabaseEngine = 'sqlserver'
): Promise<ForeignKeyRelationship[]> {
  const provider = getDatabaseProvider(engine, connStr);
  await provider.connect(connStr);
  if (provider.getForeignKeysForErd) {
    return await provider.getForeignKeysForErd(databaseName);
  }
  return [];
}
