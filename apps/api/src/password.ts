// Password hashing con scrypt (nativo de Node, sin dependencias externas).
// Compatibilidad hacia atrás: si el valor almacenado NO tiene el prefijo, se trata
// como texto plano heredado (legacy) y se puede migrar de forma transparente al loguear.
import crypto from 'crypto';

const PREFIX = 'scrypt$';
const KEYLEN = 64;

export const isHashed = (stored: string | null | undefined): boolean =>
  typeof stored === 'string' && stored.startsWith(PREFIX);

export const hashPassword = (plain: string): string => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, KEYLEN);
  return `${PREFIX}${salt.toString('hex')}$${hash.toString('hex')}`;
};

export const verifyPassword = (plain: string, stored: string | null | undefined): boolean => {
  if (!stored) return false;
  if (!isHashed(stored)) {
    // Password heredado en texto plano.
    return stored === plain;
  }
  const parts = stored.split('$'); // ['scrypt', saltHex, hashHex]
  const saltHex = parts[1];
  const hashHex = parts[2];
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(plain, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
