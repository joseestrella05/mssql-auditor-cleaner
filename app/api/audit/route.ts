import { NextRequest, NextResponse } from 'next/server';
import { decryptConnectionString } from '@/lib/crypto';
import { auditDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { encryptedConnectionString, algorithm = 'aes-256-gcm', secretKey = '', databaseName } = body;

    if (!encryptedConnectionString) {
      return NextResponse.json(
        { error: 'Debe ingresar un Connection String cifrado.' },
        { status: 400 }
      );
    }

    if (!databaseName) {
      return NextResponse.json(
        { error: 'Debe seleccionar una base de datos para auditar.' },
        { status: 400 }
      );
    }

    // 1. Descifrado en memoria (nunca persistido en disco)
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

    // 2. Ejecución de la auditoría profunda
    const summary = await auditDatabase(plainConnectionString, databaseName);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    console.error('Error in /api/audit:', err);
    return NextResponse.json(
      { error: `Error durante la auditoría SQL: ${err.message || 'Fallo desconocido'}` },
      { status: 500 }
    );
  }
}
