import type express from 'express';
import type pg from 'pg';
import multer from 'multer';

type PrismaLike = any;

const norm = (v: unknown, fallback = '') => String(v ?? '').trim() || fallback;

const parseJson = (v: unknown): Record<string, unknown> | null => {
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v) as unknown;
      return typeof p === 'object' && p != null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return null;
    }
  }
  return null;
};

const toIntOrNull = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toInt = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const registerModuleAdminRoutes = (
  router: express.Router,
  prisma: PrismaLike,
  _pool: pg.Pool,
  _uploadMemory: multer.Multer
) => {
  router.get('/subscription-plans', async (req, res) => {
    try {
      const status = norm(req.query.status);
      const where = status ? { status } : {};
      const rows = await prisma.subscriptionPlan.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { organizations: true } } }
      });
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list plans', details: error?.message || String(error) });
    }
  });

  router.post('/subscription-plans', async (req, res) => {
    try {
      const code = norm(req.body?.code).toUpperCase();
      const name = norm(req.body?.name);
      if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

      const clash = await prisma.subscriptionPlan.findUnique({ where: { code } });
      if (clash) return res.status(400).json({ error: 'A plan with this code already exists.' });

      const row = await prisma.subscriptionPlan.create({
        data: {
          code,
          name,
          description: norm(req.body?.description) || null,
          status: norm(req.body?.status, 'Active') || 'Active',
          sortOrder: toInt(req.body?.sortOrder, 0),
          billingPeriod: norm(req.body?.billingPeriod, 'Monthly') || 'Monthly',
          priceCents: toInt(req.body?.priceCents, 0),
          currency: norm(req.body?.currency, 'USD').toUpperCase() || 'USD',
          trialDays: toInt(req.body?.trialDays, 0),
          badgeLabel: norm(req.body?.badgeLabel) || null,
          maxUsers: toIntOrNull(req.body?.maxUsers),
          maxCompanies: toIntOrNull(req.body?.maxCompanies),
          maxStorageMb: toIntOrNull(req.body?.maxStorageMb),
          maxApiCallsPerDay: toIntOrNull(req.body?.maxApiCallsPerDay),
          features: parseJson(req.body?.features) as any
        }
      });
      return res.status(201).json(row);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create plan', details: error?.message || String(error) });
    }
  });

  router.put('/subscription-plans/:id', async (req, res) => {
    try {
      const id = norm(req.params.id);
      if (!id) return res.status(400).json({ error: 'id is required' });

      const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Plan not found' });

      const nextCode = req.body?.code !== undefined ? norm(req.body.code).toUpperCase() : undefined;
      if (nextCode && nextCode !== existing.code) {
        const clash = await prisma.subscriptionPlan.findFirst({ where: { code: nextCode, id: { not: id } } });
        if (clash) return res.status(400).json({ error: 'A plan with this code already exists.' });
      }

      const data: Record<string, unknown> = {};
      if (req.body?.name !== undefined) data.name = norm(req.body.name);
      if (req.body?.description !== undefined) data.description = norm(req.body.description) || null;
      if (req.body?.status !== undefined) data.status = norm(req.body.status, 'Active') || 'Active';
      if (req.body?.sortOrder !== undefined) data.sortOrder = toInt(req.body.sortOrder, 0);
      if (req.body?.billingPeriod !== undefined) data.billingPeriod = norm(req.body.billingPeriod, 'Monthly') || 'Monthly';
      if (req.body?.priceCents !== undefined) data.priceCents = toInt(req.body.priceCents, 0);
      if (req.body?.currency !== undefined) data.currency = norm(req.body.currency, 'USD').toUpperCase() || 'USD';
      if (req.body?.trialDays !== undefined) data.trialDays = toInt(req.body.trialDays, 0);
      if (req.body?.badgeLabel !== undefined) data.badgeLabel = norm(req.body.badgeLabel) || null;
      if (req.body?.maxUsers !== undefined) data.maxUsers = toIntOrNull(req.body.maxUsers);
      if (req.body?.maxCompanies !== undefined) data.maxCompanies = toIntOrNull(req.body.maxCompanies);
      if (req.body?.maxStorageMb !== undefined) data.maxStorageMb = toIntOrNull(req.body.maxStorageMb);
      if (req.body?.maxApiCallsPerDay !== undefined) data.maxApiCallsPerDay = toIntOrNull(req.body.maxApiCallsPerDay);
      if (req.body?.features !== undefined) data.features = parseJson(req.body.features) as any;
      if (nextCode !== undefined) data.code = nextCode;

      const row = await prisma.subscriptionPlan.update({
        where: { id },
        data
      });
      return res.json(row);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update plan', details: error?.message || String(error) });
    }
  });

  router.delete('/subscription-plans/:id', async (req, res) => {
    try {
      const id = norm(req.params.id);
      if (!id) return res.status(400).json({ error: 'id is required' });

      const count = await prisma.organization.count({ where: { subscriptionPlanId: id } });
      if (count > 0) {
        return res.status(409).json({
          error: 'Cannot delete a plan that is assigned to organizations. Deactivate it instead.',
          organizationsCount: count
        });
      }

      await prisma.subscriptionPlan.delete({ where: { id } });
      return res.json({ success: true });
    } catch (error: any) {
      if (error?.code === 'P2025') return res.status(404).json({ error: 'Plan not found' });
      return res.status(500).json({ error: 'Failed to delete plan', details: error?.message || String(error) });
    }
  });
};
