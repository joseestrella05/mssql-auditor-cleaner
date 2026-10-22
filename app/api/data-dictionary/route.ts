import { NextRequest, NextResponse } from 'next/server';
import { decryptConnectionString } from '@/lib/crypto';
import { getDataDictionary, getForeignKeysForErd } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      encryptedConnectionString, 
      algorithm = 'aes-256-gcm', 
      secretKey = '', 
      databaseName,
      tables,
      engine = 'sqlserver'
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

    if (!Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json(
        { error: 'Debe seleccionar al menos una tabla para exportar la documentación.' },
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

    // 1. Columnas y tipos de datos
    const columns = await getDataDictionary(plainConnectionString, databaseName, tables, engine);

    // 2. Claves foráneas para construir el Mermaid ERD
    const allForeignKeys = await getForeignKeysForErd(plainConnectionString, databaseName, engine);

    // Filtrar relaciones que involucran las tablas seleccionadas
    const selectedSet = new Set(tables.map(t => t.toLowerCase()));
    const relevantForeignKeys = allForeignKeys.filter(fk => {
      const parent = `${fk.parentSchema}.${fk.parentTable}`.toLowerCase();
      const ref = `${fk.refSchema}.${fk.refTable}`.toLowerCase();
      return selectedSet.has(parent) || selectedSet.has(ref);
    });

    return NextResponse.json({
      success: true,
      columns,
      foreignKeys: relevantForeignKeys
    });
  } catch (err: any) {
    console.error('Error in /api/data-dictionary:', err);
    return NextResponse.json(
      { error: `Error al generar la documentación técnica: ${err.message || 'Fallo desconocido'}` },
      { status: 500 }
    );
  }
}
