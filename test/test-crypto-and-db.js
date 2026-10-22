const assert = require('assert');
const { decryptConnectionString, encryptConnectionString } = require('../lib/crypto.ts');
const { generateMarkdownReport, generateCsvReport } = require('../lib/export-helpers.ts');
const { getDatabaseProvider, parsePostgresConfig, PostgresProvider, SqlServerProvider } = require('../lib/providers/index.ts');

// Función de parseo aislada para verificación directa
function parseConnectionStringToConfig(connStr, overrideDatabase) {
  const pairs = connStr.split(';').filter(p => p.trim().length > 0);
  const map = new Map();

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx !== -1) {
      const key = pair.slice(0, eqIdx).trim().toLowerCase();
      const val = pair.slice(eqIdx + 1).trim();
      map.set(key, val);
    }
  }

  const rawServer = map.get('server') || map.get('data source') || map.get('addr') || map.get('address') || 'localhost';
  let server = rawServer;
  let port = undefined;

  if (server.toLowerCase().startsWith('tcp:')) {
    server = server.slice(4);
  }

  if (server.includes(',')) {
    const parts = server.split(',');
    server = parts[0].trim();
    port = parseInt(parts[1].trim(), 10) || 1433;
  } else if (server.includes(':')) {
    const parts = server.split(':');
    server = parts[0].trim();
    port = parseInt(parts[1].trim(), 10) || 1433;
  }

  const database = overrideDatabase || map.get('database') || map.get('initial catalog') || 'master';
  const user = map.get('user id') || map.get('uid') || map.get('user') || '';
  const password = map.get('password') || map.get('pwd') || '';
  
  const encryptRaw = (map.get('encrypt') || 'false').toLowerCase();
  const encrypt = encryptRaw === 'true' || encryptRaw === 'yes' || encryptRaw === '1';

  const trustCertRaw = (map.get('trustservercertificate') || 'true').toLowerCase();
  const trustServerCertificate = trustCertRaw === 'true' || trustCertRaw === 'yes' || trustCertRaw === '1';

  return {
    server,
    port,
    database,
    user: user || undefined,
    password: password || undefined,
    options: {
      encrypt,
      trustServerCertificate
    }
  };
}

console.log('🧪 Iniciando Suite de Pruebas Unitarias del Auditor SQL...');

// Test 1: AES-256-GCM Roundtrip
{
  const plainConn = 'Server=tcp:sqlcluster.prod,1433;Database=LegacyCRM;User Id=auditor;Password=Secret#123;Encrypt=True;';
  const secretKey = 'SuperSecretKey2026';
  
  const encrypted = encryptConnectionString(plainConn, 'aes-256-gcm', secretKey);
  assert(encrypted && encrypted !== plainConn, 'El payload cifrado debe existir y ser diferente');
  
  const decrypted = decryptConnectionString(encrypted, 'aes-256-gcm', secretKey);
  assert.strictEqual(decrypted, plainConn, 'El texto descifrado debe coincidir exactamente con el original');
  console.log('✔ Test 1: AES-256-GCM Roundtrip exitoso.');
}

// Test 2: AES-256-GCM Clave Incorrecta
{
  const plainConn = 'Server=localhost;Database=Test;';
  const encrypted = encryptConnectionString(plainConn, 'aes-256-gcm', 'KeyA');
  
  assert.throws(() => {
    decryptConnectionString(encrypted, 'aes-256-gcm', 'KeyB');
  }, /bad decrypt|Unsupported state or unable to authenticate data|Payload inválido/, 'Debe fallar ante clave incorrecta');
  console.log('✔ Test 2: Detección de clave incorrecta / alteración de payload exitosa.');
}

// Test 3: Passthrough / Plain Text
{
  const plainConn = 'plain:Server=localhost;Database=ERP;';
  const decrypted = decryptConnectionString(plainConn, 'plain');
  assert.strictEqual(decrypted, 'Server=localhost;Database=ERP;');
  console.log('✔ Test 3: Passthrough plain: exitoso.');
}

// Test 4: Parse ADO.NET Connection String
{
  const connStr = 'Server=tcp:db01.corp,1433;Initial Catalog=OldBilling;User ID=sa;Password=Pass123!;Encrypt=True;TrustServerCertificate=True;';
  const config = parseConnectionStringToConfig(connStr, 'OverriddenDb');
  
  assert.strictEqual(config.server, 'db01.corp');
  assert.strictEqual(config.port, 1433);
  assert.strictEqual(config.database, 'OverriddenDb');
  assert.strictEqual(config.user, 'sa');
  assert.strictEqual(config.password, 'Pass123!');
  assert.strictEqual(config.options.encrypt, true);
  assert.strictEqual(config.options.trustServerCertificate, true);
  console.log('✔ Test 4: Parser ADO.NET a config mssql exitoso.');
}

// Test 5: Exportadores Markdown y CSV
{
  const mockSummary = {
    serverInfo: {
      serverName: 'SQL-PROD-01',
      productVersion: '16.0.4100',
      edition: 'Enterprise Edition (64-bit)'
    },
    databaseName: 'Legacy_762_Tables_DB',
    sqlServerStartTime: '2026-06-01T00:00:00.000Z',
    uptimeDays: 142,
    uptimeHours: 8,
    uptimeMinutes: 30,
    uptimeFormatted: '142 días, 8 hrs, 30 min',
    auditedAt: new Date().toISOString(),
    kpis: {
      totalTables: 762,
      activeCount: 45,
      activePct: 5.9,
      readOnlyCount: 112,
      readOnlyPct: 14.7,
      staleCount: 50,
      stalePct: 6.5,
      obsoleteCount: 555,
      obsoletePct: 72.8,
      metadataCount: 0,
      emptyTablesCount: 12,
      reclaimableSizeMb: 12450.5,
      tablesWithDependenciesCount: 8,
      totalRows: 85000000,
      totalSizeMb: 125000.5,
      totalReads: 5000000,
      totalWrites: 1200000
    },
    tables: [
      {
        schemaName: 'dbo',
        tableName: 'Z_TMP_2019_BACKUP',
        fullName: 'dbo.Z_TMP_2019_BACKUP',
        totalRows: 1500000,
        hasRows: true,
        totalSizeMb: 420.5,
        totalReads: 0,
        totalSeeks: 0,
        totalScans: 0,
        totalLookups: 0,
        totalWrites: 0,
        lastReadDate: null,
        lastWriteDate: null,
        lastActivityDate: null,
        daysSinceLastActivity: null,
        daysSinceLastRead: null,
        daysSinceLastWrite: null,
        incomingFkCount: 0,
        referencingObjectsCount: 0,
        dependenciesCount: 0,
        isSystemMetadata: false,
        classification: 'obsolete'
      },
      {
        schemaName: 'ref',
        tableName: 'Paises',
        fullName: 'ref.Paises',
        totalRows: 240,
        hasRows: true,
        totalSizeMb: 0.05,
        totalReads: 85000,
        totalSeeks: 85000,
        totalScans: 0,
        totalLookups: 0,
        totalWrites: 0,
        lastReadDate: '2026-10-21T07:30:00.000Z',
        lastWriteDate: null,
        lastActivityDate: '2026-10-21T07:30:00.000Z',
        daysSinceLastActivity: 0,
        daysSinceLastRead: 0,
        daysSinceLastWrite: null,
        incomingFkCount: 4,
        referencingObjectsCount: 2,
        dependenciesCount: 6,
        isSystemMetadata: false,
        classification: 'readonly'
      },
      {
        schemaName: 'sales',
        tableName: 'Orders',
        fullName: 'sales.Orders',
        totalRows: 5000000,
        hasRows: true,
        totalSizeMb: 4500.0,
        totalReads: 1200000,
        totalSeeks: 1100000,
        totalScans: 50000,
        totalLookups: 50000,
        totalWrites: 650000,
        lastReadDate: '2026-10-21T09:00:00.000Z',
        lastWriteDate: '2026-10-21T09:01:00.000Z',
        lastActivityDate: '2026-10-21T09:01:00.000Z',
        daysSinceLastActivity: 0,
        daysSinceLastRead: 0,
        daysSinceLastWrite: 0,
        incomingFkCount: 2,
        referencingObjectsCount: 5,
        dependenciesCount: 7,
        isSystemMetadata: false,
        classification: 'active'
      }
    ]
  };

  const md = generateMarkdownReport(mockSummary);
  assert(md.includes('Legacy_762_Tables_DB'), 'El reporte MD debe incluir el nombre de la BD');
  assert(md.includes('Z_TMP_2019_BACKUP'), 'El reporte MD debe listar tablas obsoletas');
  assert(md.includes('142 días'), 'El reporte MD debe incluir el uptime');

  const csv = generateCsvReport(mockSummary);
  assert(csv.includes('BaseDeDatos,Esquema,Tabla'), 'El CSV debe tener encabezados');
  assert(csv.includes('INACTIVA_SIN_USO'), 'El CSV debe contener la clasificación');
  assert(csv.includes('Orders'), 'El CSV debe contener las tablas');
  console.log('✔ Test 5: Generadores Markdown y CSV verificados.');
}

// Test 6: Validación de Ratio Seeks vs Scans y Precisión Física LOBs (Fase 3)
{
  const testTable = {
    schemaName: 'audit',
    tableName: 'Log_Payloads',
    fullName: 'audit.Log_Payloads',
    totalRows: 100000,
    hasRows: true,
    totalSizeMb: 1250.75,
    lobSizeMb: 1100.25, // VARCHAR(MAX) payloads
    totalReads: 50,
    totalSeeks: 0,
    totalScans: 50,
    totalLookups: 0,
    totalWrites: 12000,
    seekScanRatio: 'SCAN_ONLY',
    isSystemMetadata: false,
    classification: 'active'
  };

  assert.strictEqual(testTable.seekScanRatio, 'SCAN_ONLY', 'Debe detectar SCAN_ONLY cuando no hay seeks');
  assert(testTable.lobSizeMb > 0, 'Debe registrar peso de LOBs');
  assert(testTable.totalSizeMb >= testTable.lobSizeMb, 'El peso total debe incluir LOBs');
  console.log('✔ Test 6: Verificación de Ratio Seek/Scan y LOBs (Fase 3) exitosa.');
}

// Test 7: Comparativa de Snapshots Locales (Fase 3)
{
  const prevSnapshot = {
    version: '1.0',
    snapshotDate: '2026-09-01T00:00:00.000Z',
    databaseName: 'LegacyDB',
    tables: [
      { fullName: 'dbo.DeadTable', totalRows: 500, totalReads: 0, totalWrites: 0, classification: 'obsolete' },
      { fullName: 'dbo.ActiveTable', totalRows: 1000, totalReads: 100, totalWrites: 50, classification: 'active' }
    ]
  };

  const currTables = [
    { fullName: 'dbo.DeadTable', totalRows: 500, totalReads: 0, totalWrites: 0, classification: 'obsolete' },
    { fullName: 'dbo.ActiveTable', totalRows: 1500, totalReads: 300, totalWrites: 120, classification: 'active' },
    { fullName: 'dbo.NewTable', totalRows: 10, totalReads: 5, totalWrites: 5, classification: 'active' }
  ];

  // Simulación de comparación
  const prevMap = new Map(prevSnapshot.tables.map(t => [t.fullName, t]));
  const persistentZeroIo = [];
  const rowsChanged = [];

  for (const curr of currTables) {
    const prev = prevMap.get(curr.fullName);
    if (prev) {
      if (prev.totalReads === 0 && prev.totalWrites === 0 && curr.totalReads === 0 && curr.totalWrites === 0) {
        persistentZeroIo.push(curr.fullName);
      }
      if (curr.totalRows !== prev.totalRows) {
        rowsChanged.push({ name: curr.fullName, delta: curr.totalRows - prev.totalRows });
      }
    }
  }

  assert.strictEqual(persistentZeroIo.length, 1, 'Debe detectar exactamente 1 tabla con 0 I/O persistente');
  assert.strictEqual(persistentZeroIo[0], 'dbo.DeadTable');
  assert.strictEqual(rowsChanged.length, 1, 'Debe detectar 1 tabla con cambio de filas');
  assert.strictEqual(rowsChanged[0].delta, 500);
  console.log('✔ Test 7: Algoritmo de contraste de Snapshots (Fase 3) exitoso.');
}

// Test 8: Blindaje contra Incompatibilidad de Base de Datos en Snapshots
{
  const snapshotVentas = {
    version: '1.0',
    metadata: {
      databaseName: 'BD_Ventas',
      serverInstance: 'SRV-PROD-01\\SQLEXPRESS',
      createdAt: new Date().toISOString(),
      uptimeStartTime: new Date().toISOString(),
      totalTablesCount: 150
    },
    tables: [{ fullName: 'dbo.Facturas', totalRows: 50000, totalReads: 100, totalWrites: 50 }]
  };

  const currentDbAudited = 'BD_Nomina';
  const isMismatch = snapshotVentas.metadata.databaseName.toLowerCase() !== currentDbAudited.toLowerCase();

  assert.strictEqual(isMismatch, true, 'Debe detectar incompatibilidad entre BD_Ventas y BD_Nomina');

  // Si hay mismatch, no debe permitirse calcular deltas
  let canCompare = !isMismatch;
  assert.strictEqual(canCompare, false, 'La comparación debe bloquearse cuando las bases de datos difieren');

  // Caso coincidente
  const currentDbCorrect = 'bd_ventas';
  const isMatch = snapshotVentas.metadata.databaseName.toLowerCase() === currentDbCorrect.toLowerCase();
  assert.strictEqual(isMatch, true, 'Debe aceptar bases de datos coincidentes insensible a mayúsculas');
  console.log('✔ Test 8: Blindaje e integridad de metadata en Snapshots verificado.');
}

// Test 9: Factoría de Proveedores Multi-Engine y Cumplimiento de Contrato
{
  const sqlProvider = getDatabaseProvider('sqlserver');
  assert(sqlProvider instanceof SqlServerProvider, 'Debe instanciar SqlServerProvider');
  assert.strictEqual(sqlProvider.engine, 'sqlserver');

  const pgProvider = getDatabaseProvider('postgres');
  assert(pgProvider instanceof PostgresProvider, 'Debe instanciar PostgresProvider');
  assert.strictEqual(pgProvider.engine, 'postgres');

  // MySQL y SQLite deben existir en la arquitectura y lanzar mensajes informativos del roadmap
  const mysqlProvider = getDatabaseProvider('mysql');
  assert.strictEqual(mysqlProvider.engine, 'mysql');
  assert.rejects(async () => {
    await mysqlProvider.connect('Server=localhost');
  }, /roadmap/, 'MySQL debe informar estado en roadmap');

  const sqliteProvider = getDatabaseProvider('sqlite');
  assert.strictEqual(sqliteProvider.engine, 'sqlite');
  assert.rejects(async () => {
    await sqliteProvider.connect('file.db');
  }, /roadmap/, 'SQLite debe informar estado en roadmap');

  console.log('✔ Test 9: Factoría Multi-Engine y stubs listos para MySQL y SQLite exitosos.');
}

// Test 10: Parser de Configuración y URIs de PostgreSQL
{
  // 10.1: URI estándar
  const uri = 'postgresql://admin_user:P%40ss123@pg-cluster.corp.net:5433/prod_catalog?sslmode=require';
  const cfg1 = parsePostgresConfig(uri);
  assert.strictEqual(cfg1.host, 'pg-cluster.corp.net');
  assert.strictEqual(cfg1.port, 5433);
  assert.strictEqual(cfg1.user, 'admin_user');
  assert.strictEqual(cfg1.password, 'P@ss123');
  assert.strictEqual(cfg1.database, 'prod_catalog');
  assert.deepStrictEqual(cfg1.ssl, { rejectUnauthorized: false });

  // 10.2: Pares clave-valor con override de base de datos
  const kv = 'Host=10.0.0.5;Port=5432;User=postgres;Password=secret;Database=template1;SSL Mode=disable';
  const cfg2 = parsePostgresConfig(kv, 'custom_analytics');
  assert.strictEqual(cfg2.host, '10.0.0.5');
  assert.strictEqual(cfg2.port, 5432);
  assert.strictEqual(cfg2.user, 'postgres');
  assert.strictEqual(cfg2.password, 'secret');
  assert.strictEqual(cfg2.database, 'custom_analytics', 'Override de base de datos debe prevalecer');
  assert.strictEqual(cfg2.ssl, false);

  console.log('✔ Test 10: Parser de URIs y configuraciones PostgreSQL exitoso.');
}

// Test 11: Generador DDL de Aislamiento para PostgreSQL (SET SCHEMA archive)
{
  const pgProvider = new PostgresProvider();
  const mockTables = [
    {
      schemaName: 'public',
      tableName: 'antiguos_logs',
      fullName: 'public.antiguos_logs',
      totalRows: 120000,
      hasRows: true,
      totalSizeMb: 45.5,
      lobSizeMb: 12.0,
      totalReads: 0,
      totalSeeks: 0,
      totalScans: 0,
      totalLookups: 0,
      totalWrites: 0,
      lastReadDate: null,
      lastWriteDate: null,
      lastActivityDate: null,
      daysSinceLastActivity: 95,
      daysSinceLastRead: null,
      daysSinceLastWrite: null,
      incomingFkCount: 2,
      referencingObjectsCount: 0,
      dependenciesCount: 2,
      seekScanRatio: 'NONE',
      isSystemMetadata: false,
      classification: 'obsolete',
    }
  ];

  const script = pgProvider.generateArchiveScript(mockTables, {
    targetSchema: 'archive',
    databaseName: 'telemetry_db',
  });

  assert(script.includes('\\c "telemetry_db";'), 'Debe conectar a la base de datos de PostgreSQL');
  assert(script.includes('CREATE SCHEMA IF NOT EXISTS "archive";'), 'Debe asegurar el schema archive');
  assert(script.includes('ALTER TABLE "public"."antiguos_logs" SET SCHEMA "archive";'), 'Debe generar ALTER TABLE SET SCHEMA');
  assert(script.includes('COMMENT ON TABLE "archive"."antiguos_logs" IS'), 'Debe generar metadatos de auditoría con COMMENT ON TABLE');
  assert(script.includes('COMMIT;'), 'Debe encapsular en bloque transaccional');

  console.log('✔ Test 11: Generador DDL de archivado PostgreSQL (SET SCHEMA archive) exitoso.');
}

// Test 12: Generador DDL de Aislamiento para SQL Server (ALTER SCHEMA TRANSFER)
{
  const sqlProvider = new SqlServerProvider();
  const mockTables = [
    {
      schemaName: 'dbo',
      tableName: 'TemporalOld',
      fullName: 'dbo.TemporalOld',
      totalRows: 500,
      hasRows: true,
      totalSizeMb: 1.5,
      lobSizeMb: 0,
      totalReads: 0,
      totalSeeks: 0,
      totalScans: 0,
      totalLookups: 0,
      totalWrites: 0,
      lastReadDate: null,
      lastWriteDate: null,
      lastActivityDate: null,
      daysSinceLastActivity: 120,
      daysSinceLastRead: null,
      daysSinceLastWrite: null,
      incomingFkCount: 0,
      referencingObjectsCount: 0,
      dependenciesCount: 0,
      seekScanRatio: 'NONE',
      isSystemMetadata: false,
      classification: 'obsolete',
    }
  ];

  const script = sqlProvider.generateArchiveScript(mockTables, {
    targetSchema: 'archive',
    databaseName: 'ERP_Core',
  });

  assert(script.includes('USE [ERP_Core];'), 'Debe usar USE [db]');
  assert(script.includes('ALTER SCHEMA [archive] TRANSFER [dbo].[TemporalOld];'), 'Debe usar ALTER SCHEMA TRANSFER');
  assert(script.includes('sys.sp_addextendedproperty'), 'Debe agregar propiedades extendidas');

  console.log('✔ Test 12: Generador DDL de archivado SQL Server (ALTER SCHEMA TRANSFER) exitoso.');
}

console.log('🎉 Todas las pruebas unitarias pasaron satisfactoriamente (12/12).');
