'use client';

import React, { useState } from 'react';
import { Database, Search, ArrowRight, Loader2, Layers } from 'lucide-react';
import { DatabaseItem, ServerInfo } from '@/lib/types';

interface DatabaseSelectorProps {
  databases: DatabaseItem[];
  serverInfo: ServerInfo;
  onAudit: (dbName: string) => void;
  isAuditing: boolean;
}

export function DatabaseSelector({ databases, serverInfo, onAudit, isAuditing }: DatabaseSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDb, setSelectedDb] = useState<string>(databases[0]?.name || '');

  const filteredDbs = databases.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartAudit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDb) {
      onAudit(selectedDb);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="p-6 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">2. Selección de Base de Datos</h2>
            <p className="text-xs text-slate-400">
              {databases.length} bases de datos de usuario ONLINE detectadas en {serverInfo.serverName}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleStartAudit} className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Buscar Base de Datos
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Filtrar por nombre (ej: ERP, Ventas, CRM)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Base de Datos a Analizar <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              required
            >
              {filteredDbs.length === 0 ? (
                <option value="" disabled>No se encontraron coincidencias</option>
              ) : (
                filteredDbs.map((db) => (
                  <option key={db.databaseId} value={db.name}>
                    {db.name} (Nivel {db.compatibilityLevel})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Layers className="w-3.5 h-3.5" />
            <span>Las bases de sistema (master, msdb, tempdb, model) han sido filtradas automáticamente.</span>
          </div>
          <button
            type="submit"
            disabled={isAuditing || !selectedDb}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition flex items-center gap-2 disabled:opacity-50"
          >
            {isAuditing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extrayendo telemetría de particiones y DMVs...</span>
              </>
            ) : (
              <>
                <span>Analizar Base de Datos</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
