import express from 'express';
import type { Pool } from 'pg';
import {
  resolveTenantAuthContext,
  resolveUserIdFromSessionToken
} from '@sinapsis/module-sdk-server';

type PrismaLike = any;

interface SubscriptionPlansModuleContext {
  app: express.Express;
  pool: Pool;
  prisma: PrismaLike;
}

const MODULE_CODE = 'SUBSCRIPTION_PLANS';

const bearerToken = (req: express.Request) => {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
};

export default function registerSubscriptionPlansModule({ app, pool, prisma }: SubscriptionPlansModuleContext) {
  const router = express.Router();

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  const requireTenant = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const token = bearerToken(req);
      const userId = await resolveUserIdFromSessionToken(pool, token);
      if (!userId) {
        return res.status(401).json({ error: 'Bearer token is required.' });
      }
      const ctx = await resolveTenantAuthContext(pool, userId);
      if (!ctx) {
        return res.status(403).json({ error: 'Unable to resolve tenant organization for user.' });
      }
      (req as express.Request & { tenantCtx: typeof ctx }).tenantCtx = ctx;
      return next();
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Auth failed' });
    }
  };

  router.get('/openapi.json', async (_req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Subscription plans module is not active.' });
      res.json({
        openapi: '3.0.3',
        info: { title: 'Subscription plans', version: '1.0.0' },
        paths: {}
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || String(error) });
    }
  });

  router.get('/docs', (_req, res) => {
    res.redirect('/api/subscription-plans/openapi.json');
  });

  router.get('/me', requireTenant, async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Subscription plans module is not active.' });
      const ctx = (req as express.Request & { tenantCtx: { organizationId: string } }).tenantCtx;
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        include: { subscriptionPlan: true }
      });
      if (!org) return res.status(404).json({ error: 'Organization not found.' });
      return res.json({
        organizationId: org.id,
        plan: org.subscriptionPlan
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load plan', details: error?.message || String(error) });
    }
  });

  router.get('/catalog', requireTenant, async (_req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Subscription plans module is not active.' });
      const plans = await prisma.subscriptionPlan.findMany({
        where: { status: 'Active' },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
      });
      return res.json(plans);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list plans', details: error?.message || String(error) });
    }
  });

  router.put('/current', requireTenant, async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Subscription plans module is not active.' });
      const ctx = (req as express.Request & { tenantCtx: { organizationId: string } }).tenantCtx;
      const planId = String(req.body?.planId || '').trim();
      const planCode = String(req.body?.planCode || '').trim().toUpperCase();
      let target = null as any;
      if (planId) {
        target = await prisma.subscriptionPlan.findFirst({ where: { id: planId, status: 'Active' } });
      } else if (planCode) {
        target = await prisma.subscriptionPlan.findFirst({ where: { code: planCode, status: 'Active' } });
      }
      if (!target) {
        return res.status(400).json({ error: 'planId or planCode must reference an active subscription plan.' });
      }
      const updated = await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { subscriptionPlanId: target.id },
        include: { subscriptionPlan: true }
      });
      return res.json({
        organizationId: updated.id,
        plan: updated.subscriptionPlan
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update plan', details: error?.message || String(error) });
    }
  });

  app.use('/api/subscription-plans', router);

  return {
    basePath: '/api/subscription-plans',
    openapiPath: '/api/subscription-plans/openapi.json',
    docsPath: '/api/subscription-plans/docs'
  };
}
