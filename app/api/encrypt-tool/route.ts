import { NextRequest, NextResponse } from 'next/server';
import { encryptConnectionString } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { plainConnectionString, algorithm = 'aes-256-gcm', secretKey = '' } = body;

    if (!plainConnectionString) {
      return NextResponse.json(
        { error: 'Debe ingresar un Connection String en texto plano.' },
        { status: 400 }
      );
    }

    const encrypted = encryptConnectionString(plainConnectionString, algorithm, secretKey);

    return NextResponse.json({
      success: true,
      encrypted,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error al cifrar cadena de conexión' },
      { status: 500 }
    );
  }
}
