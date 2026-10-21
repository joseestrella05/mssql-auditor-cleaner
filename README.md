# MSSQL Auditor & Cleaner 🛡️📊

Aplicación web local de alto rendimiento desarrollada con **Next.js 15, React 19, TypeScript, Tailwind CSS y Node.js** para la **auditoría profunda, detección de obsolescencia, documentación técnica y saneamiento de esquemas masivos (700+ tablas) en Microsoft SQL Server** a partir de cadenas de conexión cifradas en memoria o credenciales directas.

---

## 🏛️ Arquitectura del Proyecto

```
d:\Invento\
├── app/
│   ├── api/
│   │   ├── connect/route.ts            # Descifrado en RAM, prueba de conexión y catálogo de DBs ONLINE
│   │   ├── audit/route.ts              # Auditoría profunda de particiones, LOBs e índices
│   │   ├── table-dependencies/route.ts # Inspección de FKs entrantes y vistas con SCHEMABINDING
│   │   ├── data-dictionary/route.ts    # Extracción de columnas, tipos, PKs y relaciones para ERD
│   │   └── encrypt-tool/route.ts       # Utilitario para cifrar Connection Strings (AES-256-GCM / CBC)
│   ├── globals.css                     # Estilos globales, paleta Dark Mode y scrollbars personalizados
│   ├── layout.tsx                      # Layout raíz de Next.js
│   └── page.tsx                        # Interfaz unificada responsiva y de ancho extendido
├── components/
│   ├── ConnectionCard.tsx              # Conexión dual: Formulario Estructurado (Windows/SQL Auth) o Cadena Directa
│   ├── DatabaseSelector.tsx            # Selector desplegable reactivo con búsqueda integrada
│   ├── KpiCards.tsx                    # Dashboard de métricas (Activas, Solo Lectura, 0 I/O, Espacio Recuperable)
│   ├── DataTable.tsx                   # Tabla virtualizada (@tanstack/react-virtual) para 700+ filas a 60 FPS
│   ├── ArchiveScriptModal.tsx          # Generador DDL de aislamiento seguro (ALTER SCHEMA TRANSFER con FK NOCHECK)
│   ├── DataDictionaryModal.tsx         # Generador de Diccionario Markdown y Diagrama Mermaid ERD (erDiagram)
│   └── SnapshotCompareModal.tsx        # Comparativa histórica de Snapshots locales para confirmar 0 I/O persistente
├── lib/
│   ├── crypto.ts                       # Capa modular de descifrado simétrico estrictamente en memoria RAM
│   ├── db.ts                           # Conexión nativa de alto rendimiento vía ODBC Driver 18 (msnodesqlv8)
│   ├── export-helpers.ts               # Generadores de reportes técnicos en Markdown y CSV
│   ├── sql-queries.ts                  # Consultas SQL profundas optimizadas para el motor
│   └── types.ts                        # Definiciones TypeScript de todo el dominio
├── test/
│   └── test-crypto-and-db.js           # Suite de pruebas unitarias automatizadas (7/7 tests)
├── patch-fs.js                         # Polyfill para compatibilidad de symlinks en Windows y Node 24
├── package.json                        # Dependencias y scripts de construcción
└── tailwind.config.js                  # Configuración de diseño responsivo
```

---

## 🚀 Características Principales

1. **Seguridad Zero-Disk:** Cero persistencia de contraseñas o connection strings en disco; descifrado y autenticación estrictamente en la memoria RAM del servidor.
2. **Conexión Dual y Resiliente:** Soporte nativo para Autenticación de Windows (SSPI) y SQL Server Authentication a través de Shared Memory (LPC) mediante `msnodesqlv8` y `ODBC Driver 18 for SQL Server`.
3. **Telemetría Física y Ratio Seek/Scan:**
   - Suma precisa de espacio físico en disco considerando `in_row_used_page_count`, `lob_used_page_count` y `row_overflow_used_page_count`.
   - Detección de tablas accedidas exclusivamente por escaneo completo (`SCAN_ONLY`).
4. **Protección DDL contra Errores:**
   - Detección automática de vistas vinculadas a esquema (`WITH SCHEMABINDING`) para advertir bloqueos en el motor antes de intentar transferencias de esquema.
   - Generación de scripts con `ALTER TABLE [hija] NOCHECK CONSTRAINT` para transferir tablas sin violar integridad referencial.
5. **Documentación de Tablas Vivas:**
   - **Diccionario de Datos en Markdown:** Columnas, tipos exactos, nulabilidad, identidad, claves primarias y descripciones extendidas.
   - **Diagrama Mermaid ERD (`erDiagram`):** Mapeo visual automático de relaciones de claves foráneas directas.
6. **Snapshots Comparativos Locales:**
   - Descarga de instantáneas en formato `.json` sin almacenar en servidor.
   - Detección de deltas para confirmar qué tablas se mantienen estrictamente en 0 I/O a lo largo de semanas o meses.
7. **Rendimiento a 60 FPS:** Virtualización de filas con `@tanstack/react-virtual` y búsqueda con debounce optimizada para esquemas con cientos de tablas.

---

## 🛠️ Instalación y Ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar pruebas unitarias
npm test

# 3. Compilar para producción
npm run build

# 4. Iniciar servidor local
npm start
```

La aplicación estará disponible en `http://localhost:3000`.
