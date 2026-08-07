// OrganiHogar — Adjuntos de tareas: material de referencia (padres) y evidencia de
// tareas completadas (fotos/videos que suben los hijos al marcar como hecha).
import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import type { Pool } from 'pg';
import { saveTaskFile, deleteTaskFile, resolveDisplayUrl } from './storage';
import { isParentUser } from './family';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB — alcanza para fotos y videos cortos.
});

export function registerAttachmentRoutes(
  router: express.Router,
  pool: Pool,
  deps: { ensureActive: () => Promise<boolean> }
) {
  const { ensureActive } = deps;

  router.post('/:id/attachments', upload.single('file'), async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });
      const taskId = req.params.id;
      const uploaderId = String(req.body?.uploaderId || '').trim();
      const kind = String(req.body?.kind || 'attachment') === 'evidence' ? 'evidence' : 'attachment';
      const file = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined;

      if (!uploaderId || !file) return res.status(400).json({ error: 'uploaderId and file are required.' });

      const taskExists = await pool.query('SELECT id FROM "Task" WHERE id = $1 LIMIT 1', [taskId]);
      if (!taskExists.rows[0]) return res.status(404).json({ error: 'Task not found' });

      const saved = await saveTaskFile(pool, {
        taskId,
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype
      });

      const id = crypto.randomUUID();
      const ext = (file.originalname.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
      await pool.query(
        `INSERT INTO "TaskAttachment" (id, "taskId", kind, "fileUrl", "filePath", "originalName", "mimeType", "fileExt", "sizeBytes", "uploadedById", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [id, taskId, kind, saved.url, saved.key, file.originalname, file.mimetype, ext, file.size, uploaderId]
      );

      const out = await pool.query('SELECT * FROM "TaskAttachment" WHERE id = $1', [id]);
      res.status(201).json(out.rows[0]);
    } catch (error: any) {
      if (error?.code === 'STORAGE_NOT_CONFIGURED') return res.status(503).json({ error: 'STORAGE_NOT_CONFIGURED', details: error.message });
      res.status(500).json({ error: 'Failed to upload attachment', details: error.message });
    }
  });

  router.get('/:id/attachments', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });
      const kind = String(req.query.kind || '').trim();
      const params: any[] = [req.params.id];
      let sql = 'SELECT * FROM "TaskAttachment" WHERE "taskId" = $1';
      if (kind) {
        params.push(kind);
        sql += ' AND kind = $2';
      }
      sql += ' ORDER BY "createdAt" ASC';
      const r = await pool.query(sql, params);
      // La URL guardada puede haber vencido (S3 firmada): se resuelve fresca al leer.
      const rows = await Promise.all(r.rows.map(async (row: any) => ({ ...row, fileUrl: (await resolveDisplayUrl(pool, row.filePath)) || row.fileUrl })));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list attachments', details: error.message });
    }
  });

  router.delete('/attachments/:attachmentId', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });
      const requesterId = String(req.body?.requesterId || req.query.requesterId || '').trim();
      const r = await pool.query('SELECT * FROM "TaskAttachment" WHERE id = $1 LIMIT 1', [req.params.attachmentId]);
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: 'Attachment not found' });

      // Solo quien lo subió o un padre puede borrarlo.
      if (row.uploadedById !== requesterId && !(await isParentUser(pool, requesterId))) {
        return res.status(403).json({ error: 'Not allowed to delete this attachment.' });
      }

      await pool.query('DELETE FROM "TaskAttachment" WHERE id = $1', [row.id]);
      await deleteTaskFile(pool, row.filePath || '');
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete attachment', details: error.message });
    }
  });
}
