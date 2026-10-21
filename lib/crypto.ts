import crypto from 'crypto';

/**
 * Módulo de Descifrado y Cifrado en Memoria.
 * Garantiza confidencialidad absoluta: ninguna credencial ni connection string
 * se persiste en almacenamiento secundario ni en logs.
 */

export interface DecryptionOptions {
  algorithm?: 'aes-256-gcm' | 'aes-256-cbc' | 'plain';
  secretKey?: string;
}

/**
 * Deriva una clave de 32 bytes (256 bits) de forma determinista usando SHA-256
 * o usa el buffer directo si es un string Base64 válido de 32 bytes.
 */
function deriveKey(secret: string): Buffer {
  try {
    const raw = Buffer.from(secret, 'base64');
    if (raw.length === 32) return raw;
  } catch {
    // Continúa con derivación SHA-256
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Descifra una cadena de conexión cifrada en memoria.
 * @param encryptedInput Payload cifrado (generalmente Base64 o prefijado con plain:)
 * @param algorithm Algoritmo seleccionado
 * @param secretKey Clave simétrica o passphrase
 */
export function decryptConnectionString(
  encryptedInput: string,
  algorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'plain' = 'aes-256-gcm',
  secretKey: string = ''
): string {
  if (!encryptedInput || !encryptedInput.trim()) {
    throw new Error('El Connection String cifrado no puede estar vacío.');
  }

  const trimmed = encryptedInput.trim();

  // Soporte directo para modo de prueba / texto plano
  if (algorithm === 'plain' || trimmed.startsWith('plain:')) {
    return trimmed.startsWith('plain:') ? trimmed.slice(6).trim() : trimmed;
  }

  if (!secretKey) {
    throw new Error('Se requiere una clave secreta o passphrase para el descifrado simétrico.');
  }

  const keyBuffer = deriveKey(secretKey);

  if (algorithm === 'aes-256-gcm') {
    // Formato de payload: [12 bytes IV/Nonce] + [16 bytes Auth Tag] + [Ciphertext]
    const buffer = Buffer.from(trimmed, 'base64');
    const ivLength = 12;
    const tagLength = 16;

    if (buffer.length < ivLength + tagLength) {
      throw new Error('Payload inválido para AES-256-GCM: tamaño insuficiente para IV y AuthTag.');
    }

    const iv = buffer.subarray(0, ivLength);
    const authTag = buffer.subarray(ivLength, ivLength + tagLength);
    const ciphertext = buffer.subarray(ivLength + tagLength);

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  if (algorithm === 'aes-256-cbc') {
    // Formato de payload: [16 bytes IV] + [Ciphertext]
    const buffer = Buffer.from(trimmed, 'base64');
    const ivLength = 16;

    if (buffer.length < ivLength) {
      throw new Error('Payload inválido para AES-256-CBC: tamaño insuficiente para IV.');
    }

    const iv = buffer.subarray(0, ivLength);
    const ciphertext = buffer.subarray(ivLength);

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  throw new Error(`Algoritmo no soportado: ${algorithm}`);
}

/**
 * Método utilitario para que el usuario pueda generar connection strings cifrados de prueba.
 */
export function encryptConnectionString(
  plainText: string,
  algorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'plain' = 'aes-256-gcm',
  secretKey: string = ''
): string {
  if (!plainText || !plainText.trim()) {
    throw new Error('El texto plano no puede estar vacío.');
  }

  if (algorithm === 'plain') {
    return `plain:${plainText.trim()}`;
  }

  if (!secretKey) {
    throw new Error('Se requiere una clave secreta para cifrar.');
  }

  const keyBuffer = deriveKey(secretKey);

  if (algorithm === 'aes-256-gcm') {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Empaquetar: IV (12) + Tag (16) + Ciphertext
    const combined = Buffer.concat([iv, authTag, ciphertext]);
    return combined.toString('base64');
  }

  if (algorithm === 'aes-256-cbc') {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final()
    ]);

    const combined = Buffer.concat([iv, ciphertext]);
    return combined.toString('base64');
  }

  throw new Error(`Algoritmo no soportado: ${algorithm}`);
}
