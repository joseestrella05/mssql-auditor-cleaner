/**
 * Consultas SQL avanzadas de Fase 3 para Microsoft SQL Server (2012+).
 * Precisión física de almacenamiento (incluyendo LOBs), dependencias detalladas,
 * Schemabinding y extracción de diccionario de datos.
 */

export const SQL_QUERIES = {
  /**
   * Obtiene la versión e información de edición de la instancia SQL Server.
   */
  GET_SERVER_INFO: `
    SELECT 
      CAST(SERVERPROPERTY('ServerName') AS NVARCHAR(128)) AS serverName,
      CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)) AS productVersion,
      CAST(SERVERPROPERTY('Edition') AS NVARCHAR(128)) AS edition;
  `,

  /**
   * Obtiene el uptime de la instancia SQL Server desde sys.dm_os_sys_info.
   */
  GET_ENGINE_START_TIME: `
    SELECT sqlserver_start_time AS sqlServerStartTime
    FROM sys.dm_os_sys_info WITH (NOLOCK);
  `,

  /**
   * Obtiene las bases de datos disponibles en estado ONLINE (excluyendo sistema).
   */
  GET_ONLINE_DATABASES: `
    SELECT 
      database_id AS databaseId,
      name,
      state_desc AS stateDesc,
      collation_name AS collationName,
      compatibility_level AS compatibilityLevel
    FROM sys.databases WITH (NOLOCK)
    WHERE state_desc = 'ONLINE'
      AND name NOT IN ('master', 'tempdb', 'model', 'msdb')
    ORDER BY name ASC;
  `,

  /**
   * Consulta profunda de telemetría de tablas con precisión física de LOBs y ratios Seek/Scan.
   * 1. Suma in_row_used_page_count + lob_used_page_count + row_overflow_used_page_count.
   * 2. Calcula lob_size_mb para visibilizar el peso de VARCHAR(MAX), TEXT, IMAGE, VARBINARY.
   * 3. Cuenta Foreign Keys entrantes y objetos dependientes.
   * 4. Calcula ratios seeks vs scans y marcas temporales exactas.
   */
  AUDIT_TABLE_USAGE: `
    WITH FK_Agg AS (
      SELECT 
        referenced_object_id AS object_id,
        COUNT(*) AS incoming_fk_count
      FROM sys.foreign_keys WITH (NOLOCK)
      GROUP BY referenced_object_id
    ),
    Dep_Agg AS (
      SELECT 
        referenced_id AS object_id,
        COUNT(DISTINCT referencing_id) AS referencing_objects_count
      FROM sys.sql_expression_dependencies WITH (NOLOCK)
      WHERE referenced_id IS NOT NULL
      GROUP BY referenced_id
    ),
    PartitionStatsAgg AS (
      SELECT
        p.object_id,
        SUM(p.row_count) AS total_rows,
        -- Precisión Física Total: In-Row + LOBs + Row Overflow
        CAST(SUM(p.in_row_used_page_count + p.lob_used_page_count + p.row_overflow_used_page_count) * 8.0 / 1024.0 AS DECIMAL(18, 2)) AS total_size_mb,
        CAST(SUM(p.lob_used_page_count) * 8.0 / 1024.0 AS DECIMAL(18, 2)) AS lob_size_mb
      FROM sys.dm_db_partition_stats p WITH (NOLOCK)
      WHERE p.index_id IN (0, 1) -- 0: Heap, 1: Clustered Index
      GROUP BY p.object_id
    ),
    IndexUsageStatsAgg AS (
      SELECT
        u.object_id,
        SUM(CAST(u.user_seeks AS BIGINT)) AS total_seeks,
        SUM(CAST(u.user_scans AS BIGINT)) AS total_scans,
        SUM(CAST(u.user_lookups AS BIGINT)) AS total_lookups,
        SUM(CAST(u.user_updates AS BIGINT)) AS total_updates,
        MAX(r.max_read_date) AS last_read_date,
        MAX(u.last_user_update) AS last_write_date
      FROM sys.dm_db_index_usage_stats u WITH (NOLOCK)
      CROSS APPLY (
        SELECT MAX(d) AS max_read_date
        FROM (VALUES (u.last_user_seek), (u.last_user_scan), (u.last_user_lookup)) AS dt(d)
      ) r
      WHERE u.database_id = DB_ID()
      GROUP BY u.object_id
    )
    SELECT
      s.name AS schema_name,
      t.name AS table_name,
      ISNULL(p.total_rows, 0) AS total_rows,
      ISNULL(p.total_size_mb, 0.0) AS total_size_mb,
      ISNULL(p.lob_size_mb, 0.0) AS lob_size_mb,
      ISNULL(u.total_seeks, 0) AS total_seeks,
      ISNULL(u.total_scans, 0) AS total_scans,
      ISNULL(u.total_lookups, 0) AS total_lookups,
      ISNULL(u.total_updates, 0) AS total_updates,
      u.last_read_date,
      u.last_write_date,
      DATEDIFF(day, u.last_read_date, GETDATE()) AS days_since_last_read,
      DATEDIFF(day, u.last_write_date, GETDATE()) AS days_since_last_write,
      DATEDIFF(day, 
        (SELECT MAX(act) FROM (VALUES (u.last_read_date), (u.last_write_date)) AS m(act)), 
        GETDATE()
      ) AS days_since_last_activity,
      ISNULL(fk.incoming_fk_count, 0) AS incoming_fk_count,
      ISNULL(dep.referencing_objects_count, 0) AS referencing_objects_count,
      (ISNULL(fk.incoming_fk_count, 0) + ISNULL(dep.referencing_objects_count, 0)) AS dependencies_count,
      -- Ratio Seeks vs Scans
      CASE 
        WHEN ISNULL(u.total_scans, 0) > 0 AND ISNULL(u.total_seeks, 0) = 0 THEN 'SCAN_ONLY'
        WHEN ISNULL(u.total_scans, 0) > 0 THEN CAST(ROUND(CAST(u.total_seeks AS FLOAT) / u.total_scans, 2) AS VARCHAR(20))
        WHEN ISNULL(u.total_seeks, 0) > 0 THEN 'SEEK_ONLY'
        ELSE 'NONE'
      END AS seek_scan_ratio,
      CASE 
        WHEN t.name IN ('sysdiagrams', '__EFMigrationsHistory', 'schema_migrations', '__MigrationHistory', 'flyway_schema_history') 
             OR t.name LIKE '[_][_]%' 
             OR s.name = 'sys'
        THEN 1 ELSE 0 
      END AS is_system_metadata
    FROM sys.tables t WITH (NOLOCK)
    INNER JOIN sys.schemas s WITH (NOLOCK) 
      ON t.schema_id = s.schema_id
    LEFT JOIN PartitionStatsAgg p 
      ON t.object_id = p.object_id
    LEFT JOIN IndexUsageStatsAgg u 
      ON t.object_id = u.object_id
    LEFT JOIN FK_Agg fk 
      ON t.object_id = fk.object_id
    LEFT JOIN Dep_Agg dep 
      ON t.object_id = dep.object_id
    WHERE t.is_ms_shipped = 0
    ORDER BY 
      s.name ASC, 
      t.name ASC;
  `,

  /**
   * Inspección detallada de dependencias por nombre para una tabla específica.
   * Consulta Foreign Keys entrantes y objetos programables (vistas, SPs, funciones, triggers),
   * comprobando específicamente si las vistas tienen SCHEMABINDING (bloqueante para DDL).
   */
  GET_TABLE_DEPENDENCY_DETAILS: `
    -- 1. Foreign Keys entrantes (tablas hijas que apuntan a esta tabla)
    SELECT 
      'FOREIGN_KEY' AS dependency_type,
      fk.name AS constraint_name,
      OBJECT_SCHEMA_NAME(fk.parent_object_id) AS referencing_schema,
      OBJECT_NAME(fk.parent_object_id) AS referencing_name,
      'CONSTRAINT' AS object_type_desc,
      0 AS is_schema_bound,
      'Hija: ' + OBJECT_SCHEMA_NAME(fk.parent_object_id) + '.' + OBJECT_NAME(fk.parent_object_id) + ' [' + fk.name + ']' AS details
    FROM sys.foreign_keys fk WITH (NOLOCK)
    WHERE fk.referenced_object_id = OBJECT_ID(@tableFullName)

    UNION ALL

    -- 2. Vistas, Stored Procedures, Funciones y Triggers dependientes
    SELECT 
      'PROGRAMMABLE_OBJECT' AS dependency_type,
      o.name AS constraint_name,
      s.name AS referencing_schema,
      o.name AS referencing_name,
      o.type_desc AS object_type_desc,
      ISNULL(OBJECTPROPERTY(o.object_id, 'IsSchemaBound'), 0) AS is_schema_bound,
      o.type_desc + ': ' + s.name + '.' + o.name + 
      CASE WHEN OBJECTPROPERTY(o.object_id, 'IsSchemaBound') = 1 THEN ' (WITH SCHEMABINDING)' ELSE '' END AS details
    FROM sys.sql_expression_dependencies dep WITH (NOLOCK)
    INNER JOIN sys.objects o WITH (NOLOCK) ON dep.referencing_id = o.object_id
    INNER JOIN sys.schemas s WITH (NOLOCK) ON o.schema_id = s.schema_id
    WHERE dep.referenced_id = OBJECT_ID(@tableFullName)
    ORDER BY is_schema_bound DESC, dependency_type ASC, referencing_schema ASC, referencing_name ASC;
  `,

  /**
   * Diccionario de datos: columnas, tipos, nulabilidad, primary keys y descripciones.
   */
  GET_DATA_DICTIONARY: `
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
      AND t.object_id = OBJECT_ID(@tableFullName)
    ORDER BY c.column_id ASC;
  `,

  /**
   * Relaciones de Foreign Keys entre las tablas vivas (para construir el diagrama Mermaid ERD).
   */
  GET_FOREIGN_KEYS_FOR_ERD: `
    SELECT 
      fk.name AS fk_name,
      s_parent.name AS parent_schema,
      t_parent.name AS parent_table,
      c_parent.name AS parent_column,
      s_ref.name AS ref_schema,
      t_ref.name AS ref_table,
      c_ref.name AS ref_column
    FROM sys.foreign_keys fk WITH (NOLOCK)
    INNER JOIN sys.foreign_key_columns fkc WITH (NOLOCK) ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.tables t_parent WITH (NOLOCK) ON fk.parent_object_id = t_parent.object_id
    INNER JOIN sys.schemas s_parent WITH (NOLOCK) ON t_parent.schema_id = s_parent.schema_id
    INNER JOIN sys.columns c_parent WITH (NOLOCK) ON t_parent.object_id = c_parent.object_id AND fkc.parent_column_id = c_parent.column_id
    INNER JOIN sys.tables t_ref WITH (NOLOCK) ON fk.referenced_object_id = t_ref.object_id
    INNER JOIN sys.schemas s_ref WITH (NOLOCK) ON t_ref.schema_id = s_ref.schema_id
    INNER JOIN sys.columns c_ref WITH (NOLOCK) ON t_ref.object_id = c_ref.object_id AND fkc.referenced_column_id = c_ref.column_id
    WHERE t_parent.is_ms_shipped = 0 AND t_ref.is_ms_shipped = 0;
  `
};
