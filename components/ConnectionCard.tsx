'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  LogIn, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck,
  BookmarkPlus,
  Trash2,
  FolderOpen,
  Layers,
  Globe,
  Radio,
  SlidersHorizontal,
  HardDrive
} from 'lucide-react';
import { DatabaseEngine, DatabaseItem, SavedConnectionProfile, ServerInfo } from '@/lib/types';

interface ConnectionCardProps {
  onConnected: (data: {
    engine: DatabaseEngine;
    serverInfo: ServerInfo;
    databases: DatabaseItem[];
    encryptedConnectionString: string;
    algorithm: string;
    secretKey: string;
  }) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
}

const LOCAL_STORAGE_PROFILES_KEY = 'multi_engine_db_auditor_profiles_v2';

export function ConnectionCard({ onConnected, isLoading, setIsLoading }: ConnectionCardProps) {
  // Selector de Motor Activo
  const [engine, setEngine] = useState<DatabaseEngine>('sqlserver');

  // Toggle Directa vs Estructurada
  const [isDirectMode, setIsDirectMode] = useState(false);

  // Modo Estructurado: SQL Server
  const [mssqlServer, setMssqlServer] = useState('NP26-SOPORTE\\SQLEXPRESS');
  const [mssqlAuthMode, setMssqlAuthMode] = useState<'windows' | 'sql'>('windows');
  const [mssqlUser, setMssqlUser] = useState('sa');
  const [mssqlPassword, setMssqlPassword] = useState('');
  const [mssqlEncrypt, setMssqlEncrypt] = useState(true);
  const [mssqlTrustServerCert, setMssqlTrustServerCert] = useState(true);

  // Modo Estructurado: PostgreSQL
  const [pgHost, setPgHost] = useState('localhost');
  const [pgPort, setPgPort] = useState(5432);
  const [pgUser, setPgUser] = useState('postgres');
  const [pgPassword, setPgPassword] = useState('');
  const [pgDatabase, setPgDatabase] = useState('postgres');
  const [pgSslMode, setPgSslMode] = useState<'disable' | 'require'>('disable');

  // Visibilidad de contraseñas
  const [showPassword, setShowPassword] = useState(false);

  // Modo Cadena Directa
  const [directConnString, setDirectConnString] = useState('');
  
  // Soporte Opcional para Cadenas Cifradas en Modo Directo
  const [isEncryptedPayload, setIsEncryptedPayload] = useState(false);
  const [encryptionAlgorithm, setEncryptionAlgorithm] = useState<'aes-256-gcm' | 'aes-256-cbc'>('aes-256-gcm');
  const [secretKey, setSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Perfiles Guardados en localStorage
  const [savedProfiles, setSavedProfiles] = useState<SavedConnectionProfile[]>([]);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [showSaveProfileDialog, setShowSaveProfileDialog] = useState(false);

  // Estados visuales
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connectedServer, setConnectedServer] = useState<ServerInfo | null>(null);

  // Cargar perfiles desde localStorage al montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
      if (stored) {
        setSavedProfiles(JSON.parse(stored));
      } else {
        // Migrar perfiles legados si existían
        const legacy = localStorage.getItem('mssql_auditor_connection_profiles');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          const migrated = parsed.map((p: any) => ({ ...p, engine: 'sqlserver' }));
          setSavedProfiles(migrated);
        }
      }
    } catch {
      // Ignorar fallos de parsing de storage
    }
  }, []);

  const handleSaveProfile = () => {
    if (!profileNameInput.trim()) return;

    const newProfile: SavedConnectionProfile = {
      id: Date.now().toString(),
      name: profileNameInput.trim(),
      engine,
      server: engine === 'sqlserver' ? mssqlServer.trim() : pgHost.trim(),
      port: engine === 'postgres' ? pgPort : undefined,
      database: engine === 'postgres' ? pgDatabase.trim() : 'master',
      authMode: engine === 'sqlserver' ? mssqlAuthMode : 'sql',
      user: engine === 'sqlserver' 
        ? (mssqlAuthMode === 'sql' ? mssqlUser.trim() : undefined) 
        : pgUser.trim(),
      sslMode: engine === 'postgres' ? pgSslMode : undefined,
      encrypt: engine === 'sqlserver' ? mssqlEncrypt : pgSslMode === 'require',
      trustServerCertificate: engine === 'sqlserver' ? mssqlTrustServerCert : true,
      createdAt: new Date().toISOString(),
    };

    const updated = [newProfile, ...savedProfiles.filter(p => p.name !== newProfile.name)];
    setSavedProfiles(updated);
    localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(updated));
    setProfileNameInput('');
    setShowSaveProfileDialog(false);
  };

  const handleSelectProfile = (profileId: string) => {
    const found = savedProfiles.find(p => p.id === profileId);
    if (!found) return;

    const profileEngine = found.engine || 'sqlserver';
    setEngine(profileEngine);

    if (profileEngine === 'sqlserver') {
      setMssqlServer(found.server);
      setMssqlAuthMode(found.authMode || 'windows');
      if (found.user) setMssqlUser(found.user);
      setMssqlEncrypt(found.encrypt ?? true);
      setMssqlTrustServerCert(found.trustServerCertificate ?? true);
      setMssqlPassword('');
    } else if (profileEngine === 'postgres') {
      setPgHost(found.server);
      if (found.port) setPgPort(found.port);
      if (found.user) setPgUser(found.user);
      if (found.database) setPgDatabase(found.database);
      if (found.sslMode) setPgSslMode(found.sslMode);
      setPgPassword('');
    }

    setIsDirectMode(false);
    setErrorMsg(null);
  };

  const handleDeleteProfile = (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedProfiles.filter(p => p.id !== profileId);
    setSavedProfiles(updated);
    localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(updated));
  };

  /**
   * Construye dinámicamente la cadena de conexión basada en el motor y modo activo
   */
  const buildConnectionString = (): { connStr: string; algorithm: string; secret: string } => {
    if (isDirectMode) {
      if (!directConnString.trim()) {
        throw new Error('Por favor ingrese la cadena o URI de conexión en el área de texto.');
      }

      if (isEncryptedPayload) {
        if (!secretKey.trim()) {
          throw new Error('Debe ingresar la clave secreta para descifrar el connection string.');
        }
        return {
          connStr: directConnString.trim(),
          algorithm: encryptionAlgorithm,
          secret: secretKey.trim(),
        };
      }

      return {
        connStr: directConnString.trim(),
        algorithm: 'plain',
        secret: '',
      };
    }

    // Modo Formulario Estructurado: PostgreSQL
    if (engine === 'postgres') {
      if (!pgHost.trim()) {
        throw new Error('El campo Host es obligatorio para PostgreSQL.');
      }
      if (!pgUser.trim()) {
        throw new Error('El campo Usuario es obligatorio para PostgreSQL.');
      }

      const encodedUser = encodeURIComponent(pgUser.trim());
      const encodedPass = encodeURIComponent(pgPassword);
      const auth = pgPassword ? `${encodedUser}:${encodedPass}@` : `${encodedUser}@`;
      const host = pgHost.trim();
      const port = pgPort || 5432;
      const db = encodeURIComponent(pgDatabase.trim() || 'postgres');
      const ssl = pgSslMode === 'require' ? '?sslmode=require' : '?sslmode=disable';

      const uri = `postgresql://${auth}${host}:${port}/${db}${ssl}`;

      return {
        connStr: uri,
        algorithm: 'plain',
        secret: '',
      };
    }

    // Modo Formulario Estructurado: SQL Server
    if (engine === 'sqlserver') {
      if (!mssqlServer.trim()) {
        throw new Error('El campo Servidor / Instancia es obligatorio para SQL Server.');
      }

      const tokens: string[] = [
        `Server=${mssqlServer.trim()}`,
        `Database=master`,
      ];

      if (mssqlAuthMode === 'windows') {
        tokens.push('Trusted_Connection=True');
      } else {
        if (!mssqlUser.trim()) {
          throw new Error('Debe ingresar el nombre de usuario de SQL Server.');
        }
        tokens.push(`User Id=${mssqlUser.trim()}`);
        tokens.push(`Password=${mssqlPassword}`);
      }

      tokens.push(`Encrypt=${mssqlEncrypt ? 'True' : 'False'}`);
      tokens.push(`TrustServerCertificate=${mssqlTrustServerCert ? 'True' : 'False'}`);

      return {
        connStr: tokens.join(';') + ';',
        algorithm: 'plain',
        secret: '',
      };
    }

    throw new Error(`Motor de base de datos '${engine}' aún no admitido para conexión directa.`);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setConnectedServer(null);

    let connectionData;
    try {
      connectionData = buildConnectionString();
    } catch (err: any) {
      setErrorMsg(err.message);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          encryptedConnectionString: connectionData.connStr,
          algorithm: connectionData.algorithm,
          secretKey: connectionData.secret,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo establecer conexión con el servidor.');
      }

      setConnectedServer(data.serverInfo);
      onConnected({
        engine,
        serverInfo: data.serverInfo,
        databases: data.databases,
        encryptedConnectionString: connectionData.connStr,
        algorithm: connectionData.algorithm,
        secretKey: connectionData.secret,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inesperado al intentar conectar con la base de datos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-300">
      {/* ========================================================================= */}
      {/* 1. SELECTOR DE MOTOR RELACIONAL EN LA CABECERA (TABS / ICONOS)           */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/70 border-b border-slate-800/90 px-5 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
            <span>Motor Relacional:</span>
          </span>

          {/* Tab SQL Server */}
          <button
            type="button"
            onClick={() => {
              setEngine('sqlserver');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              engine === 'sqlserver'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/40'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>SQL Server</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal opacity-80 bg-black/20">
              msnodesqlv8
            </span>
          </button>

          {/* Tab PostgreSQL */}
          <button
            type="button"
            onClick={() => {
              setEngine('postgres');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              engine === 'postgres'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/40'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>PostgreSQL</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal opacity-80 bg-black/20">
              pg
            </span>
          </button>

          {/* Placeholders futuros MySQL y SQLite */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 ml-2">
            <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 font-mono text-slate-500">
              MySQL ⏳
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 font-mono text-slate-500">
              SQLite ⏳
            </span>
          </div>
        </div>

        {/* Indicador de driver activo */}
        <div className="text-[11px] font-mono text-slate-400 hidden sm:block">
          Driver:{' '}
          <span className="text-slate-200 font-medium">
            {engine === 'sqlserver' ? 'msnodesqlv8 (ODBC Native)' : 'pg (Node-Postgres TCP)'}
          </span>
        </div>
      </div>

      {/* Cabecera con Interruptor Toggle "Directa" y Perfiles */}
      <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            engine === 'sqlserver'
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
          }`}>
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              <span>Conexión {engine === 'sqlserver' ? 'Microsoft SQL Server' : 'PostgreSQL'}</span>
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                engine === 'sqlserver'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
              }`}>
                {engine}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {isDirectMode 
                ? 'Modo Cadena Directa (Raw Connection URI / String)' 
                : 'Modo Formulario Estructurado Multimotor'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Selector de Perfiles Guardados */}
          {savedProfiles.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <select
                onChange={(e) => handleSelectProfile(e.target.value)}
                defaultValue=""
                className="bg-transparent text-slate-300 focus:outline-none text-xs cursor-pointer"
              >
                <option value="" disabled>Cargar Perfil...</option>
                {savedProfiles.map(p => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                    {p.name} [{p.engine || 'sqlserver'}] - {p.server}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Toggle Switch Directa */}
          <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl">
            <span className="text-xs font-medium text-slate-300">Directa</span>
            <button
              type="button"
              role="switch"
              aria-checked={isDirectMode}
              onClick={() => {
                setIsDirectMode(!isDirectMode);
                setErrorMsg(null);
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                isDirectMode ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isDirectMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleConnect} className="p-5 sm:p-6 space-y-5">
        {/* ========================================================= */}
        {/* MODO 1: FORMULARIO ESTRUCTURADO (isDirectMode = false)    */}
        {/* ========================================================= */}
        {!isDirectMode ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* ------------------------------------------------------- */}
            {/* FORMULARIO ADAPTADO PARA POSTGRESQL                     */}
            {/* ------------------------------------------------------- */}
            {engine === 'postgres' ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Host */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Host / Servidor <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Server className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={pgHost}
                        onChange={(e) => setPgHost(e.target.value)}
                        placeholder="ej. localhost, 127.0.0.1 o db.corp.internal"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Puerto (default 5432) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Puerto <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={pgPort}
                      onChange={(e) => setPgPort(parseInt(e.target.value, 10) || 5432)}
                      placeholder="5432"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Usuario (default postgres) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Usuario <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={pgUser}
                        onChange={(e) => setPgUser(e.target.value)}
                        placeholder="postgres"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Contraseña */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Contraseña
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={pgPassword}
                        onChange={(e) => setPgPassword(e.target.value)}
                        placeholder="Contraseña del usuario"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-10 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Base de Datos inicial (default postgres) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Base de Datos Inicial <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={pgDatabase}
                      onChange={(e) => setPgDatabase(e.target.value)}
                      placeholder="postgres"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>

                {/* SSL Mode y Guardar Perfil */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs text-slate-300">
                  <div className="flex items-center gap-3">
                    <label className="block text-xs font-medium text-slate-300">
                      Modo SSL:
                    </label>
                    <select
                      value={pgSslMode}
                      onChange={(e: any) => setPgSslMode(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="disable">disable (Sin SSL)</option>
                      <option value="require">require (Requerido / TLS)</option>
                    </select>
                  </div>

                  {/* Guardar Perfil */}
                  <div>
                    {!showSaveProfileDialog ? (
                      <button
                        type="button"
                        onClick={() => setShowSaveProfileDialog(true)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Guardar como Perfil Local</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                        <input
                          type="text"
                          placeholder="Nombre (ej. Postgres Prod)"
                          value={profileNameInput}
                          onChange={(e) => setProfileNameInput(e.target.value)}
                          className="bg-slate-900 px-2.5 py-1 rounded-lg text-xs text-slate-200 border border-slate-700 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSaveProfileDialog(false)}
                          className="text-xs text-slate-500 hover:text-slate-300 px-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* ------------------------------------------------------- */
              /* FORMULARIO ADAPTADO PARA SQL SERVER                     */
              /* ------------------------------------------------------- */
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Servidor / Instancia */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Servidor / Instancia <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Server className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={mssqlServer}
                        onChange={(e) => setMssqlServer(e.target.value)}
                        placeholder="ej. NP26-SOPORTE\SQLEXPRESS o localhost,1433"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Modo de Autenticación */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Modo de Autenticación <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={mssqlAuthMode}
                      onChange={(e: any) => setMssqlAuthMode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value="windows">Autenticación de Windows (Integrada / SSPI)</option>
                      <option value="sql">Autenticación de SQL Server</option>
                    </select>
                  </div>
                </div>

                {/* Campos condicionales para Autenticación SQL */}
                {mssqlAuthMode === 'sql' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Usuario <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={mssqlUser}
                          onChange={(e) => setMssqlUser(e.target.value)}
                          placeholder="ej. sa"
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required={mssqlAuthMode === 'sql'}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Contraseña <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={mssqlPassword}
                          onChange={(e) => setMssqlPassword(e.target.value)}
                          placeholder="Contraseña de la cuenta"
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-10 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required={mssqlAuthMode === 'sql'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Checkboxes de Configuración TLS/SSL y Guardar Perfil */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs text-slate-300">
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={mssqlEncrypt}
                        onChange={(e) => setMssqlEncrypt(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                      />
                      <span className="font-medium">Encrypt</span>
                      <span className="text-slate-500 text-[11px]">(TLS/SSL)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={mssqlTrustServerCert}
                        onChange={(e) => setMssqlTrustServerCert(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                      />
                      <span className="font-medium">Trust Certificate</span>
                      <span className="text-slate-500 text-[11px]">(Autofirmados)</span>
                    </label>
                  </div>

                  {/* Guardar Perfil */}
                  <div>
                    {!showSaveProfileDialog ? (
                      <button
                        type="button"
                        onClick={() => setShowSaveProfileDialog(true)}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Guardar como Perfil Local</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                        <input
                          type="text"
                          placeholder="Nombre (ej. SQL Server Local)"
                          value={profileNameInput}
                          onChange={(e) => setProfileNameInput(e.target.value)}
                          className="bg-slate-900 px-2.5 py-1 rounded-lg text-xs text-slate-200 border border-slate-700 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSaveProfileDialog(false)}
                          className="text-xs text-slate-500 hover:text-slate-300 px-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* MODO 2: CADENA DIRECTA (isDirectMode = true)              */
          /* ========================================================= */
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Cadena o URI de Conexión Completa <span className="text-red-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsEncryptedPayload(!isEncryptedPayload)}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isEncryptedPayload ? 'Modo Texto Plano' : '¿Cadena Cifrada (AES)?'}
                </button>
              </div>

              <textarea
                rows={3}
                value={directConnString}
                onChange={(e) => setDirectConnString(e.target.value)}
                placeholder={
                  engine === 'postgres'
                    ? 'postgresql://postgres:password@localhost:5432/postgres?sslmode=disable'
                    : 'Server=localhost\\SQLEXPRESS;Database=master;Trusted_Connection=True;Encrypt=True;TrustServerCertificate=True;'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {engine === 'postgres'
                  ? 'Soporta URIs estándar postgresql:// o postgres:// y pares clave=valor.'
                  : 'Soporta cadenas ODBC / ADO.NET estándar de Microsoft SQL Server.'}
              </p>
            </div>

            {/* Opciones adicionales si la cadena directa está cifrada */}
            {isEncryptedPayload && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950/80 border border-blue-500/20 rounded-xl animate-in fade-in duration-200">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Algoritmo de Descifrado
                  </label>
                  <select
                    value={encryptionAlgorithm}
                    onChange={(e: any) => setEncryptionAlgorithm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="aes-256-gcm">AES-256-GCM (Recomendado)</option>
                    <option value="aes-256-cbc">AES-256-CBC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Clave Secreta / Passphrase <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder="Ingrese clave para descifrar en memoria"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={isEncryptedPayload}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mensajes de Alerta Visual (Error / Éxito) */}
        {errorMsg && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-red-400 text-xs animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <span className="font-semibold block">Error de conexión con {engine === 'sqlserver' ? 'SQL Server' : 'PostgreSQL'}</span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {connectedServer && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-emerald-400 text-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Conectado con éxito a: <strong>{connectedServer.serverName}</strong> ({connectedServer.edition})</span>
            </div>
            <span className="text-[11px] bg-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono font-medium">ONLINE</span>
          </div>
        )}

        {/* Botón de Acción Principal */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isLoading}
            className={`px-6 py-2.5 text-white rounded-xl text-xs font-semibold shadow-lg transition flex items-center gap-2 disabled:opacity-50 ${
              engine === 'sqlserver'
                ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-500/20 hover:shadow-blue-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-indigo-500/20 hover:shadow-indigo-500/30'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Conectando y explorando catálogo...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Conectar y Listar Bases de Datos</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
