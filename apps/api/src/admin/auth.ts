import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 12;
const FALLBACK_ADMIN_EMAIL = 'admin@saas.local';
const FALLBACK_ADMIN_PASSWORD = 'change-me';
const FALLBACK_ADMIN_SECRET = 'replace-with-a-long-random-secret';

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const base64UrlDecode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const getAdminSecret = () => String(process.env.ADMIN_JWT_SECRET || FALLBACK_ADMIN_SECRET).trim();

const readBearer = (req: Request): string => {
  const auth = String(req.headers.authorization || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
};

export const validateAdminEnv = (): string | null => {
  const email = String(process.env.ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL).trim();
  const password = String(process.env.ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD).trim();
  const secret = getAdminSecret();
  if (!email || !password || !secret) {
    return 'ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_JWT_SECRET must be set in .env';
  }
  return null;
};

export const isAdminCredentialValid = (email: string, password: string): boolean => {
  const expectedEmail = String(process.env.ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL).trim();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD).trim();
  if (!expectedEmail || !expectedPassword) return false;
  return email.trim().toLowerCase() === expectedEmail.toLowerCase() && password === expectedPassword;
};

export const createAdminToken = (email: string): string => {
  const secret = getAdminSecret();
  if (!secret) throw new Error('ADMIN_JWT_SECRET is not configured');

  const payload = {
    sub: String(email).trim().toLowerCase(),
    admin: true,
    exp: Math.floor(Date.now() / 1000) + ADMIN_TOKEN_TTL_SECONDS
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

export const verifyAdminToken = (token: string): { sub: string; exp: number } | null => {
  const secret = getAdminSecret();
  if (!secret || !token.includes('.')) return null;
  const [encodedPayload, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (signature !== expectedSignature) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as { sub?: string; exp?: number; admin?: boolean };
    if (!payload?.admin) return null;
    if (!payload?.sub || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
};

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  const token = readBearer(req);
  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized admin session' });
  }
  (req as Request & { adminEmail?: string }).adminEmail = payload.sub;
  next();
};
