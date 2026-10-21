import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MSSQL Auditor & Cleaner | Herramienta de Auditoría DBA',
  description: 'Auditoría, saneamiento y detección de tablas en desuso para Microsoft SQL Server con connection string cifrado.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
