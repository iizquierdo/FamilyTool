// FamilyTool — Adaptador de storage para adjuntos de tareas. Lee la configuración
// guardada desde /admin/storage (PlatformSetting key 'storage') y sube el archivo a
// Local (disco, bajo STORAGE_ROOT) o S3 (o cualquier proveedor S3-compatible: Railway
// buckets, MinIO, Backblaze B2, Cloudflare R2, etc. vía "endpoint").
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { Pool } from 'pg';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const here = path.dirname(fileURLToPath(import.meta.url));
// modules/tasks/server/storage.ts -> modules/tasks/server -> modules/tasks -> modules -> <repo root>
const REPO_ROOT = path.resolve(here, '..', '..', '..');
// Mismo criterio que apps/api/src/paths.ts (STORAGE_ROOT env override, si no `apps/api/storage`).
const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.resolve(REPO_ROOT, 'apps', 'api', 'storage');

interface StorageConfig {
  provider: string;
  settings: Record<string, string>;
}

export const getStorageConfig = async (pool: Pool): Promise<StorageConfig> => {
  try {
    const r = await pool.query('SELECT value FROM "PlatformSetting" WHERE key = $1 LIMIT 1', ['storage']);
    const value = r.rows[0]?.value || {};
    const provider = String(value.provider || 'Local');
    const settings = value.settings && typeof value.settings === 'object' ? value.settings : {};
    return { provider, settings };
  } catch {
    return { provider: 'Local', settings: {} };
  }
};

const safeExt = (name: string) => {
  const ext = path.extname(name || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
};

const buildS3Client = (settings: Record<string, string>) =>
  new S3Client({
    region: settings.region || 'auto',
    credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey },
    endpoint: settings.endpoint || undefined,
    // Los buckets S3-compatibles (Railway, MinIO, R2, B2) casi siempre necesitan path-style.
    forcePathStyle: Boolean(settings.endpoint)
  });

const s3PublicUrl = (settings: Record<string, string>, key: string) => {
  const base = settings.publicUrlBase
    ? settings.publicUrlBase.replace(/\/$/, '')
    : settings.endpoint
      ? `${settings.endpoint.replace(/\/$/, '')}/${settings.bucket}`
      : `https://${settings.bucket}.s3.${settings.region || 'us-east-1'}.amazonaws.com`;
  return `${base}/${key}`;
};

const PRESIGN_TTL_SECONDS = 3600; // 1 hora — son fotos/videos de la familia, no públicos permanentes.

/**
 * URL para MOSTRAR un archivo ya guardado. Local: ruta estática fija. S3: si el admin
 * definió publicUrlBase (bucket/CDN público), esa URL fija; si no, una URL firmada con
 * vencimiento (el bucket queda privado por default, más seguro para fotos de los chicos).
 */
export const resolveDisplayUrl = async (pool: Pool, key: string): Promise<string> => {
  if (!key) return '';
  const config = await getStorageConfig(pool);
  if (config.provider === 'S3') {
    const { accessKey, secretKey, bucket, publicUrlBase } = config.settings;
    if (!accessKey || !secretKey || !bucket) return '';
    if (publicUrlBase) return s3PublicUrl(config.settings, key);
    try {
      const client = buildS3Client(config.settings);
      return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: PRESIGN_TTL_SECONDS });
    } catch {
      return '';
    }
  }
  return `/storage/${key}`;
};

export interface SavedFile {
  url: string;
  /** Clave de storage (relativa) — se guarda en DB para poder borrar el archivo después. */
  key: string;
}

export const saveTaskFile = async (
  pool: Pool,
  args: { taskId: string; buffer: Buffer; originalName: string; mimeType: string }
): Promise<SavedFile> => {
  const config = await getStorageConfig(pool);
  const ext = safeExt(args.originalName);
  const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
  const key = `tasks/${args.taskId}/${filename}`;

  if (config.provider === 'S3') {
    const { accessKey, secretKey, bucket } = config.settings;
    if (!accessKey || !secretKey || !bucket) {
      throw Object.assign(
        new Error('El storage S3 no está completamente configurado (faltan accessKey/secretKey/bucket en /admin/storage).'),
        { code: 'STORAGE_NOT_CONFIGURED' }
      );
    }
    const client = buildS3Client(config.settings);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: args.buffer,
        ContentType: args.mimeType || 'application/octet-stream'
      })
    );
    return { url: await resolveDisplayUrl(pool, key), key };
  }

  // Local (por defecto).
  const finalPath = path.join(STORAGE_ROOT, key);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, args.buffer);
  return { url: `/storage/${key}`, key };
};

export const deleteTaskFile = async (pool: Pool, key: string): Promise<void> => {
  if (!key) return;
  const config = await getStorageConfig(pool);
  if (config.provider === 'S3') {
    const { accessKey, secretKey, bucket } = config.settings;
    if (!accessKey || !secretKey || !bucket) return;
    try {
      const client = buildS3Client(config.settings);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      /* best-effort */
    }
    return;
  }
  try {
    fs.unlinkSync(path.join(STORAGE_ROOT, key));
  } catch {
    /* best-effort: el archivo puede no existir */
  }
};
