'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  AlertTriangle, 
  ShieldAlert, 
  FileCode2, 
  Loader2, 
  Ban, 
  Info,
  CheckCircle2
} from 'lucide-react';
import { TableMetric, TableDependencyDetail, DatabaseEngine } from '@/lib/types';

interface ArchiveScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTables: TableMetric[];
  databaseName: string;
  engine?: DatabaseEngine;
  connectionPayload?: {
    engine?: DatabaseEngine;
    encryptedConnectionString: string;
    algorithm: string;
    secretKey: string;
  } | null;
}

export function ArchiveScriptModal({
  isOpen,
  onClose,
  selectedTables,
  databaseName,
  engine,
  connectionPayload,
}: ArchiveScriptModalProps) {
  const [copied, setCopied] = useState(false);
  const [targetSchema, setTargetSchema] = useState('archive');
  const [isLoadingDeps, setIsLoadingDeps] = useState(false);
  const [dependencyMap, setDependencyMap] = useState<Record<string, TableDependencyDetail[]>>({});
  const [schemaBoundObjects, setSchemaBoundObjects] = useState<TableDependencyDetail[]>([]);

  // Inspeccionar dependencias detalladas cuando se abre el modal
  useEffect(() => {
    if (!isOpen || !connectionPayload || selectedTables.length === 0) return;

    const tablesWithDeps = selectedTables.filter(t => t.dependenciesCount > 0);
    if (tablesWithDeps.length === 0) {
      setDependencyMap({});
      setSchemaBoundObjects([]);
      return;
    }

    let isMounted = true;
    setIsLoadingDeps(true);

    fetch('/api/table-dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: connectionPayload.engine || engine || 'sqlserver',
        encryptedConnectionString: connectionPayload.encryptedConnectionString,
        algorithm: connectionPayload.algorithm,
        secretKey: connectionPayload.secretKey,
        databaseName,
        tableFullNames: tablesWithDeps.map(t => t.fullName),
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (data.success) {
          setDependencyMap(data.byTable || {});
          const bounds: TableDependencyDetail[] = (data.dependencies || []).filter(
            (d: TableDependencyDetail) => d.isSchemaBound
          );
          setSchemaBoundObjects(bounds);
        }
      })
      .catch(err => {
        console.error('Error fetching dependency details:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingDeps(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, connectionPayload, selectedTables, databaseName]);

  if (!isOpen || selectedTables.length === 0) return null;

  const tablesWithDependencies = selectedTables.filter(t => t.dependenciesCount > 0);
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const activeEngine = connectionPayload?.engine || engine || 'sqlserver';

  // Generador de script SQL adaptado al motor activo (Transact-SQL o PostgreSQL)
  const generateSqlScript = () => {
    const lines: string[] = [];

    if (activeEngine === 'postgres') {
      lines.push('-- =================================================================');
      lines.push(`-- SCRIPT DE SANEAMIENTO Y ARCHIVADO SEGURO DE TABLAS (POSTGRESQL)`);
      lines.push(`-- Base de Datos: [${databaseName}]`);
      lines.push(`-- Generado el: ${nowStr} (Auditoría DBA Senior)`);
      lines.push(`-- Total de tablas a transferir: ${selectedTables.length}`);
      lines.push('-- =================================================================');
      lines.push(`\\c "${databaseName}";\n`);

      lines.push('-- 1. Asegurar existencia del esquema de aislamiento/archivo');
      lines.push(`CREATE SCHEMA IF NOT EXISTS "${targetSchema}";\n`);

      lines.push('-- 2. Transferencia segura de esquemas en bloque transaccional');
      lines.push('BEGIN;');

      selectedTables.forEach((table) => {
        const deps = dependencyMap[table.fullName] || [];
        const fkDeps = deps.filter(d => d.dependencyType === 'FOREIGN_KEY');
        const otherDeps = deps.filter(d => d.dependencyType === 'PROGRAMMABLE_OBJECT');

        lines.push('');
        lines.push(`  -- ---------------------------------------------------------------`);
        lines.push(`  -- Tabla: "${table.schemaName}"."${table.tableName}" (${table.totalRows.toLocaleString()} filas, ${table.totalSizeMb.toFixed(2)} MB, LOBs: ${table.lobSizeMb || 0} MB)`);
        lines.push(`  -- Ratio Seek/Scan: ${table.seekScanRatio || 'N/A'} | Última actividad: ${table.daysSinceLastActivity !== null ? `hace ${table.daysSinceLastActivity} días` : 'Nunca'}`);

        if (fkDeps.length > 0) {
          lines.push(`  -- ⚠️ ADVERTENCIA: ${fkDeps.length} Foreign Keys entrantes de tablas dependientes.`);
          lines.push(`  -- En PostgreSQL, "SET SCHEMA" mantiene las FKs intactas.`);
          lines.push(`  -- Si desea desvincular o truncar la tabla archivada, considere remover la restricción:`);
          fkDeps.forEach(fk => {
            lines.push(`  -- ALTER TABLE "${fk.referencingSchema}"."${fk.referencingName}" DROP CONSTRAINT "${fk.constraintName}";`);
          });
        }

        if (otherDeps.length > 0) {
          lines.push(`  -- ⚠️ Vistas dependientes detectadas en el catálogo:`);
          otherDeps.forEach(od => {
            lines.push(`  -- • "${od.referencingSchema}"."${od.referencingName}"`);
          });
        }

        lines.push(`  -- ---------------------------------------------------------------`);
        lines.push(`  ALTER TABLE "${table.schemaName}"."${table.tableName}" SET SCHEMA "${targetSchema}";`);
        lines.push(`  COMMENT ON TABLE "${targetSchema}"."${table.tableName}" IS 'ArchivedAt: ${nowStr} | Reason: Saneamiento por auditoría de telemetría';`);
      });

      lines.push('');
      lines.push('COMMIT;');
      lines.push('');
      lines.push(`-- Verificación de tablas transferidas:`);
      lines.push(`-- SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = '${targetSchema}';\n`);

      return lines.join('\n');
    }

    // Generador para SQL Server (Transact-SQL)
    lines.push('-- =================================================================');
    lines.push(`-- SCRIPT DE SANEAMIENTO Y ARCHIVADO SEGURO DE TABLAS (SQL SERVER)`);
    lines.push(`-- Base de Datos: [${databaseName}]`);
    lines.push(`-- Generado el: ${nowStr} (Auditoría DBA Senior)`);
    lines.push(`-- Total de tablas a transferir: ${selectedTables.length}`);
    lines.push('-- =================================================================');
    lines.push(`USE [${databaseName}];`);
    lines.push('GO\n');

    if (schemaBoundObjects.length > 0) {
      lines.push('-- =================================================================');
      lines.push('-- ⛔ ATENCIÓN CRÍTICA: OBJETOS CON SCHEMABINDING DETECTADOS');
      lines.push('-- Los siguientes objetos impiden el ALTER SCHEMA TRANSFER por diseño de SQL Server.');
      lines.push('-- Deben ser eliminados o alterados (sin SCHEMABINDING) antes de ejecutar la transferencia:');
      schemaBoundObjects.forEach(obj => {
        lines.push(`--   • ${obj.details}`);
        lines.push(`--     DROP VIEW [${obj.referencingSchema}].[${obj.referencingName}];`);
      });
      lines.push('-- =================================================================\n');
    }

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
      const deps = dependencyMap[table.fullName] || [];
      const fkDeps = deps.filter(d => d.dependencyType === 'FOREIGN_KEY');
      const otherDeps = deps.filter(d => d.dependencyType === 'PROGRAMMABLE_OBJECT');

      lines.push('');
      lines.push(`    -- -------------------------------------------------------------`);
      lines.push(`    -- Tabla: [${table.schemaName}].[${table.tableName}] (${table.totalRows.toLocaleString()} filas, ${table.totalSizeMb.toFixed(2)} MB, LOBs: ${table.lobSizeMb || 0} MB)`);
      lines.push(`    -- Ratio Seek/Scan: ${table.seekScanRatio || 'N/A'} | Última actividad: ${table.daysSinceLastActivity !== null ? `hace ${table.daysSinceLastActivity} días` : 'Nunca'}`);
      
      if (fkDeps.length > 0) {
        lines.push(`    -- ⚠️ ADVERTENCIA: ${fkDeps.length} Foreign Keys entrantes de tablas hijas.`);
        lines.push(`    -- Deshabilitar comprobación de restricciones en tablas dependientes:`);
        fkDeps.forEach(fk => {
          lines.push(`    ALTER TABLE [${fk.referencingSchema}].[${fk.referencingName}] NOCHECK CONSTRAINT [${fk.constraintName}];`);
          lines.push(`    -- Para eliminar la FK permanentemente: ALTER TABLE [${fk.referencingSchema}].[${fk.referencingName}] DROP CONSTRAINT [${fk.constraintName}];`);
        });
      } else if (table.incomingFkCount > 0) {
        lines.push(`    -- ⚠️ ADVERTENCIA: Posee ${table.incomingFkCount} Foreign Keys entrantes.`);
      }

      if (otherDeps.length > 0) {
        lines.push(`    -- ⚠️ Objetos dependientes detectados en el catálogo:`);
        otherDeps.forEach(od => {
          if (od.isSchemaBound) {
            lines.push(`    -- ⛔ BLOQUEANTE: [${od.referencingSchema}].[${od.referencingName}] WITH SCHEMABINDING`);
          } else {
            lines.push(`    -- • [${od.referencingSchema}].[${od.referencingName}] (${od.objectTypeDesc})`);
          }
        });
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

    // Comentarios opcionales para reactivar restricciones
    const allFks = Object.values(dependencyMap).flat().filter(d => d.dependencyType === 'FOREIGN_KEY');
    if (allFks.length > 0) {
      lines.push('-- =================================================================');
      lines.push('-- (OPCIONAL) Sentencias para reactivar la verificación de Foreign Keys:');
      allFks.forEach(fk => {
        lines.push(`-- ALTER TABLE [${fk.referencingSchema}].[${fk.referencingName}] WITH CHECK CHECK CONSTRAINT [${fk.constraintName}];`);
      });
      lines.push('-- =================================================================');
    }

    return lines.join('\n');
  };

  const scriptContent = generateSqlScript();

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Saneamiento_${databaseName}_${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Cabecera del Modal */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Generador de Script DDL de Saneamiento Seguro</span>
                {isLoadingDeps && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
              </h3>
              <p className="text-xs text-slate-400">
                Aislamiento transaccional hacia el esquema <code className="text-indigo-300 font-mono">[{targetSchema}]</code> con resolución preventiva de FKs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ALERTA CRÍTICA: SCHEMABINDING */}
        {schemaBoundObjects.length > 0 && (
          <div className="p-4 bg-red-500/15 border-b border-red-500/30 flex items-start gap-3 text-xs text-red-200">
            <Ban className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-red-100 flex items-center gap-1.5">
                ⛔ BLOQUEO DETECTADO (WITH SCHEMABINDING)
              </span>
              <p className="text-red-300 leading-relaxed">
                SQL Server rechazará cualquier <code className="bg-red-950/80 px-1.5 py-0.5 rounded text-red-100 font-mono">ALTER SCHEMA TRANSFER</code> porque existen vistas con enlace a esquema:
              </p>
              <ul className="list-disc list-inside font-mono text-[11px] text-red-200 mt-1 space-y-0.5">
                {schemaBoundObjects.map((s, idx) => (
                  <li key={idx}>[{s.referencingSchema}].[{s.referencingName}] (WITH SCHEMABINDING)</li>
                ))}
              </ul>
              <p className="text-red-300/80 text-[11px] mt-1">
                Debe modificar o eliminar (<code className="font-mono">DROP VIEW</code>) estas vistas antes de ejecutar el script en producción.
              </p>
            </div>
          </div>
        )}

        {/* Advertencia preventiva si hay Foreign Keys entrantes */}
        {tablesWithDependencies.length > 0 && schemaBoundObjects.length === 0 && (
          <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-3 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-amber-200">
                Atención DBA: {tablesWithDependencies.length} tablas poseen restricciones o dependencias activas
              </span>
              <span className="text-amber-300/80">
                El script incluye automáticamente sentencias <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-200 font-mono">NOCHECK CONSTRAINT</code> para las Foreign Keys hijas y comentarios preventivos para evitar fallos de integridad durante la migración.
              </span>
            </div>
          </div>
        )}

        {/* Controles de Configuración */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Esquema de Destino:</span>
            <input
              type="text"
              value={targetSchema}
              onChange={(e) => setTargetSchema(e.target.value.trim() || 'archive')}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5 shadow-md shadow-indigo-500/20"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado al Portapapeles' : 'Copiar Script SQL'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Descargar .sql</span>
            </button>
          </div>
        </div>

        {/* Visor de Código SQL */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-300 select-all leading-relaxed border-t border-slate-900">
          <pre className="whitespace-pre-wrap">{scriptContent}</pre>
        </div>

        {/* Pie del Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{selectedTables.length} tablas configuradas para transferencia atómica.</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
