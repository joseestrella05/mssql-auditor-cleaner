import { NextRequest, NextResponse } from 'next/server';
import { decryptConnectionString } from '@/lib/crypto';
import { getTableDependencies } from '@/lib/db';
import { TableDependencyDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      encryptedConnectionString, 
      algorithm = 'aes-256-gcm', 
      secretKey = '', 
      databaseName,
      tableFullName,
      tableFullNames
    } = body;

    if (!encryptedConnectionString) {
      return NextResponse.json(
        { error: 'Debe ingresar un Connection String cifrado.' },
        { status: 400 }
      );
    }

    if (!databaseName) {
      return NextResponse.json(
        { error: 'Debe especificar el nombre de la base de datos.' },
        { status: 400 }
      );
    }

    const tablesToInspect: string[] = [];
    if (tableFullName && typeof tableFullName === 'string') {
      tablesToInspect.push(tableFullName);
    }
    if (Array.isArray(tableFullNames)) {
      tablesToInspect.push(...tableFullNames);
    }

    if (tablesToInspect.length === 0) {
      return NextResponse.json(
        { error: 'Debe proporcionar al menos una tabla para inspeccionar dependencias.' },
        { status: 400 }
      );
    }

    // Descifrado en memoria
    let plainConnectionString: string;
    try {
      plainConnectionString = decryptConnectionString(
        encryptedConnectionString,
        algorithm,
        secretKey
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: `Error de descifrado: ${err.message || 'Clave o payload inválido'}` },
        { status: 422 }
      );
    }

    // Consultar dependencias
    const results: Record<string, TableDependencyDetail[]> = {};
    const flatList: TableDependencyDetail[] = [];

    for (const tbl of tablesToInspect) {
      const deps = await getTableDependencies(plainConnectionString, databaseName, tbl);
      results[tbl] = deps;
      flatList.push(...deps);
    }

    const hasSchemaBoundViews = flatList.some(d => d.isSchemaBound);

    return NextResponse.json({
      success: true,
      hasSchemaBoundViews,
      dependencies: flatList,
      byTable: results
    });
  } catch (err: any) {
    console.error('Error in /api/table-dependencies:', err);
    return NextResponse.json(
      { error: `Error al inspeccionar dependencias: ${err.message || 'Fallo desconocido'}` },
      { status: 500 }
    );
  }
}
