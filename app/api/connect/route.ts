import { NextRequest, NextResponse } from 'next/server';
import { decryptConnectionString } from '@/lib/crypto';
import { testConnectionAndFetchDatabases } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { encryptedConnectionString, algorithm = 'aes-256-gcm', secretKey = '' } = body;

    if (!encryptedConnectionString) {
      return NextResponse.json(
        { error: 'Debe ingresar un Connection String cifrado.' },
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

    // 2. Conexión y consulta de catálogo
    const result = await testConnectionAndFetchDatabases(plainConnectionString);

    return NextResponse.json({
      success: true,
      serverInfo: result.serverInfo,
      databases: result.databases,
    });
  } catch (err: any) {
    console.error('Error in /api/connect:', err);
    return NextResponse.json(
      { error: `Error de conexión con Microsoft SQL Server: ${err.message || 'Fallo desconocido'}` },
      { status: 500 }
    );
  }
}
