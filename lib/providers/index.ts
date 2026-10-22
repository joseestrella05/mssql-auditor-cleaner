import { BaseDatabaseProvider } from './base-provider.ts';
import type { IDatabaseProvider } from './base-provider.ts';
import { SqlServerProvider } from './sqlserver-provider.ts';
import { PostgresProvider } from './postgres-provider.ts';
import { MySqlProvider } from './mysql-provider.ts';
import { SqliteProvider } from './sqlite-provider.ts';
import type { DatabaseEngine, DatabaseConnectionConfig } from '../types.ts';

export type { IDatabaseProvider };
export { BaseDatabaseProvider } from './base-provider.ts';
export { SqlServerProvider, normalizeOdbcConnectionString } from './sqlserver-provider.ts';
export { PostgresProvider, parsePostgresConfig } from './postgres-provider.ts';
export { MySqlProvider } from './mysql-provider.ts';
export { SqliteProvider } from './sqlite-provider.ts';

/**
 * Factoría que resuelve y entrega la instancia correspondiente del proveedor
 * según el motor de base de datos solicitado.
 */
export function getDatabaseProvider(
  engine: DatabaseEngine = 'sqlserver',
  config?: string | DatabaseConnectionConfig
): IDatabaseProvider {
  switch (engine) {
    case 'sqlserver':
      return new SqlServerProvider(config);
    case 'postgres':
      return new PostgresProvider(config);
    case 'mysql':
      return new MySqlProvider(config);
    case 'sqlite':
      return new SqliteProvider(config);
    default:
      throw new Error(`Motor de base de datos '${engine}' no soportado.`);
  }
}
