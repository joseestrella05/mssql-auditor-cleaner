'use client';

import React, { useState } from 'react';
import { Database, ShieldCheck, RefreshCw, AlertTriangle, Layers, Cpu } from 'lucide-react';
import { ConnectionCard } from '@/components/ConnectionCard';
import { DatabaseSelector } from '@/components/DatabaseSelector';
import { KpiCards } from '@/components/KpiCards';
import { DataTable } from '@/components/DataTable';
import { AuditSummary, DatabaseItem, ServerInfo, DatabaseEngine } from '@/lib/types';

export default function HomePage() {
  const [engine, setEngine] = useState<DatabaseEngine>('sqlserver');
  const [isLoadingConnection, setIsLoadingConnection] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Datos de conexión
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [databases, setDatabases] = useState<DatabaseItem[]>([]);
  const [connectionPayload, setConnectionPayload] = useState<{
    engine: DatabaseEngine;
    encryptedConnectionString: string;
    algorithm: string;
    secretKey: string;
  } | null>(null);

  // Resultado de la auditoría
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);

  const handleConnected = (data: {
    engine: DatabaseEngine;
    serverInfo: ServerInfo;
    databases: DatabaseItem[];
    encryptedConnectionString: string;
    algorithm: string;
    secretKey: string;
  }) => {
    setEngine(data.engine);
    setServerInfo(data.serverInfo);
    setDatabases(data.databases);
    setConnectionPayload({
      engine: data.engine,
      encryptedConnectionString: data.encryptedConnectionString,
      algorithm: data.algorithm,
      secretKey: data.secretKey,
    });
    setAuditSummary(null);
    setAuditError(null);
  };

  const handleAuditDatabase = async (databaseName: string) => {
    if (!connectionPayload) return;

    setIsAuditing(true);
    setAuditError(null);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: connectionPayload.engine || engine,
          encryptedConnectionString: connectionPayload.encryptedConnectionString,
          algorithm: connectionPayload.algorithm,
          secretKey: connectionPayload.secretKey,
          databaseName,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al auditar la base de datos.');
      }

      setAuditSummary(data.summary);
    } catch (err: any) {
      setAuditError(err.message || 'Error inesperado durante la auditoría.');
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header Superior */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
        <div className="w-full max-w-[96vw] 2xl:max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl shadow-lg shadow-blue-500/20 text-white">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">Multi-Engine Database Auditor</h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  v2.0 Multi-Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Auditoría de telemetría y saneamiento de tablas para SQL Server y PostgreSQL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>Memoria Segura</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Zero-Disk Encryption</span>
            </div>
          </div>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main className="flex-1 w-full max-w-[96vw] 2xl:max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Paso 1: Conexión y Descifrado */}
        <ConnectionCard
          onConnected={handleConnected}
          isLoading={isLoadingConnection}
          setIsLoading={setIsLoadingConnection}
        />

        {/* Paso 2: Selección de Base de Datos */}
        {serverInfo && databases.length > 0 && (
          <DatabaseSelector
            databases={databases}
            serverInfo={serverInfo}
            onAudit={handleAuditDatabase}
            isAuditing={isAuditing}
          />
        )}

        {/* Banner de Error durante auditoría */}
        {auditError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Error en la Auditoría</p>
              <p className="mt-1">{auditError}</p>
            </div>
          </div>
        )}

        {/* Paso 3 & 4: Dashboard KPI y Tabla de Resultados */}
        {auditSummary && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>Resultados de Auditoría:</span>
                  <span className="text-emerald-400 font-mono">[{auditSummary.databaseName}]</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Telemetría consolidada de particiones, índices de usuario y marcas temporales de I/O ({engine.toUpperCase()})
                </p>
              </div>

              <button
                onClick={() => handleAuditDatabase(auditSummary.databaseName)}
                disabled={isAuditing}
                className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                <span>Refrescar Métricas</span>
              </button>
            </div>

            {/* Tarjetas KPI */}
            <KpiCards summary={auditSummary} />

            {/* Tabla Interactiva de Resultados */}
            <DataTable summary={auditSummary} connectionPayload={connectionPayload} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/30 py-4 text-center text-xs text-slate-500">
        <p>
          Herramienta de Auditoría y Saneamiento Multi-Motor (SQL Server & PostgreSQL) • Diseñada para Arquitectura Full-Stack & DBA
        </p>
      </footer>
    </div>
  );
}
