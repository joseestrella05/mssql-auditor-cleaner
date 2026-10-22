import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseProvider } from '@/lib/providers';
import type { DatabaseEngine, TableMetric } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      engine = 'sqlserver', 
      selectedTables, 
      targetSchema = 'archive', 
      databaseName = 'master' 
    } = body as {
      engine?: DatabaseEngine;
      selectedTables: TableMetric[];
      targetSchema?: string;
      databaseName?: string;
    };

    if (!Array.isArray(selectedTables) || selectedTables.length === 0) {
      return NextResponse.json(
        { error: 'Debe proporcionar al menos una tabla para generar el script de archivado.' },
        { status: 400 }
      );
    }

    const provider = getDatabaseProvider(engine);
    const script = provider.generateArchiveScript(selectedTables, {
      targetSchema,
      databaseName,
    });

    return NextResponse.json({
      success: true,
      engine,
      script,
    });
  } catch (err: any) {
    console.error('Error in /api/archive-script:', err);
    return NextResponse.json(
      { error: `Error generando el script de archivo: ${err.message || 'Fallo desconocido'}` },
      { status: 500 }
    );
  }
}
