import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveCompanyContextForRequest,
  resolveTenantAuthContext
} from '@sinapsis/module-sdk-server';
import { reserveNextReference } from '@sinapsis/module-sdk-server';

interface CrmModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'CRM';
const OPPORTUNITY_REFERENCE = { module: 'CRM', code: 'CRM_OPPORTUNITY', prefix: 'CRM-', digits: 6 };
const ACTIVITY_REFERENCE = { module: 'CRM', code: 'CRM_ACTIVITY', prefix: 'CRA-', digits: 6 };

const CATEGORY_CODES = {
  opportunityStages: 'CRM_OPPORTUNITY_STAGE',
  opportunityStatuses: 'CRM_OPPORTUNITY_STATUS',
  activityTypes: 'CRM_ACTIVITY_TYPE',
  activityStatuses: 'CRM_ACTIVITY_STATUS'
};

const toNullableIsoDate = (value: any) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toAmount = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toProbability = (value: any) => {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return num;
};

const isWon = (value: string) => String(value || '').trim().toLowerCase() === 'won';
const isLost = (value: string) => String(value || '').trim().toLowerCase() === 'lost';
const isClosedStatus = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'won' || normalized === 'lost';
};

const statusFromStage = (stage: string, fallback = 'Open') => {
  if (isWon(stage)) return 'Won';
  if (isLost(stage)) return 'Lost';
  return fallback;
};

const nextReferenceForCompany = (pool: Pool, module: string, code: string) => (companyId: string) =>
  reserveNextReference(pool, { companyId, module, code });

const normalizeOpportunity = (row: any) => ({
  ...row,
  amount: toAmount(row.amount),
  probability: Number(row.probability || 0)
});

const buildOpportunityByIdFetcher = (pool: Pool) => async (opportunityId: string) => {
  const result = await pool.query(
    `
      SELECT
        o.*,
        c.code as "clientCode",
        c.name as "clientName",
        c.status as "clientStatus",
        owner.name as "ownerName",
        creator.name as "createdByName",
        updater.name as "updatedByName"
      FROM "CrmOpportunity" o
      JOIN "Client" c ON c.id = o."clientId"
      JOIN "User" owner ON owner.id = o."ownerId"
      JOIN "User" creator ON creator.id = o."createdById"
      JOIN "User" updater ON updater.id = o."updatedById"
      WHERE o.id = $1
      LIMIT 1
    `,
    [opportunityId]
  );

  const row = result.rows[0];
  return row ? normalizeOpportunity(row) : null;
};

const buildActivityByIdFetcher = (pool: Pool) => async (activityId: string) => {
  const result = await pool.query(
    `
      SELECT
        a.*,
        o.code as "opportunityCode",
        o.title as "opportunityTitle",
        c.id as "clientId",
        c.name as "clientName",
        assigned.name as "assignedToName",
        creator.name as "createdByName",
        updater.name as "updatedByName"
      FROM "CrmActivity" a
      JOIN "CrmOpportunity" o ON o.id = a."opportunityId"
      JOIN "Client" c ON c.id = o."clientId"
      JOIN "User" assigned ON assigned.id = a."assignedToId"
      JOIN "User" creator ON creator.id = a."createdById"
      JOIN "User" updater ON updater.id = a."updatedById"
      WHERE a.id = $1
      LIMIT 1
    `,
    [activityId]
  );

  return result.rows[0] || null;
};

export default function registerCrmModule({ app, pool }: CrmModuleContext) {
  const router = express.Router();
  const getOpportunityById = buildOpportunityByIdFetcher(pool);
  const getActivityById = buildActivityByIdFetcher(pool);
  const nextOpportunityCode = nextReferenceForCompany(pool, OPPORTUNITY_REFERENCE.module, OPPORTUNITY_REFERENCE.code);
  const nextActivityCode = nextReferenceForCompany(pool, ACTIVITY_REFERENCE.module, ACTIVITY_REFERENCE.code);

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  router.get('/openapi.json', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const serverUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        openapi: '3.0.3',
        info: {
          title: 'Sinapsis CRM API',
          version: '1.0.0',
          description: 'CRM endpoints for opportunities pipeline and activities.'
        },
        tags: [
          { name: 'CRM Meta', description: 'Metadata and dashboard summary' },
          { name: 'CRM Opportunities', description: 'Manage CRM opportunities' },
          { name: 'CRM Activities', description: 'Manage CRM activities' }
        ],
        servers: [{ url: serverUrl }],
        components: {
          schemas: {
            CrmOpportunity: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                code: { type: 'string' },
                title: { type: 'string' },
                clientId: { type: 'string' },
                clientCode: { type: 'string' },
                clientName: { type: 'string' },
                ownerId: { type: 'string' },
                ownerName: { type: 'string' },
                stage: { type: 'string' },
                status: { type: 'string' },
                amount: { type: 'number' },
                probability: { type: 'integer' },
                expectedCloseDate: { type: 'string', format: 'date-time', nullable: true },
                closedAt: { type: 'string', format: 'date-time', nullable: true },
                notes: { type: 'string', nullable: true }
              }
            },
            CrmOpportunityMoveRequest: {
              type: 'object',
              required: ['updatedById'],
              properties: {
                stage: { type: 'string', description: 'Optional. Target pipeline stage.' },
                status: { type: 'string', description: 'Optional. Opportunity status.' },
                closedAt: { type: 'string', format: 'date-time', nullable: true },
                updatedById: { type: 'string' }
              }
            }
          }
        },
        paths: {
          '/api/crm/meta': {
            get: {
              tags: ['CRM Meta'],
              summary: 'Get CRM metadata',
              parameters: [
                { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } }
              ],
              responses: { '200': { description: 'CRM metadata' } }
            }
          },
          '/api/crm/overview': {
            get: {
              tags: ['CRM Meta'],
              summary: 'Get CRM overview',
              parameters: [
                { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } }
              ],
              responses: { '200': { description: 'CRM overview' } }
            }
          },
          '/api/crm/opportunities': {
            get: {
              tags: ['CRM Opportunities'],
              summary: 'List opportunities',
              parameters: [
                { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'stage', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'ownerId', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'clientId', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'search', in: 'query', required: false, schema: { type: 'string' } }
              ],
              responses: { '200': { description: 'Opportunities list' } }
            },
            post: {
              tags: ['CRM Opportunities'],
              summary: 'Create opportunity',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['title', 'clientId', 'ownerId', 'createdById'],
                      properties: {
                        title: { type: 'string' },
                        clientId: { type: 'string' },
                        ownerId: { type: 'string' },
                        stage: { type: 'string' },
                        status: { type: 'string' },
                        amount: { type: 'number' },
                        probability: { type: 'integer' },
                        expectedCloseDate: { type: 'string', format: 'date-time', nullable: true },
                        source: { type: 'string', nullable: true },
                        notes: { type: 'string', nullable: true },
                        companyId: { type: 'string' },
                        createdById: { type: 'string' },
                        updatedById: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: { '201': { description: 'Opportunity created' } }
            }
          },
          '/api/crm/opportunities/{id}': {
            get: {
              tags: ['CRM Opportunities'],
              summary: 'Get opportunity by id',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Opportunity detail' } }
            },
            put: {
              tags: ['CRM Opportunities'],
              summary: 'Update opportunity',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['updatedById'],
                      properties: {
                        title: { type: 'string' },
                        clientId: { type: 'string' },
                        ownerId: { type: 'string' },
                        stage: { type: 'string' },
                        status: { type: 'string' },
                        amount: { type: 'number' },
                        probability: { type: 'integer' },
                        expectedCloseDate: { type: 'string', format: 'date-time', nullable: true },
                        source: { type: 'string', nullable: true },
                        notes: { type: 'string', nullable: true },
                        companyId: { type: 'string' },
                        updatedById: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: { '200': { description: 'Opportunity updated' } }
            },
            delete: {
              tags: ['CRM Opportunities'],
              summary: 'Archive opportunity',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['updatedById'],
                      properties: { updatedById: { type: 'string' } }
                    }
                  }
                }
              },
              responses: { '200': { description: 'Opportunity archived' } }
            }
          },
          '/api/crm/opportunities/{id}/move': {
            patch: {
              tags: ['CRM Opportunities'],
              summary: 'Move opportunity across pipeline stages',
              description: 'Supports drag and drop updates by stage and/or status in one request.',
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
              ],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CrmOpportunityMoveRequest' }
                  }
                }
              },
              responses: {
                '200': {
                  description: 'Opportunity moved',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/CrmOpportunity' }
                    }
                  }
                },
                '400': { description: 'Missing required fields' },
                '404': { description: 'Opportunity not found' }
              }
            }
          },
          '/api/crm/opportunities/{id}/stage': {
            patch: {
              tags: ['CRM Opportunities'],
              summary: 'Update opportunity stage',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['stage', 'updatedById'],
                      properties: {
                        stage: { type: 'string' },
                        updatedById: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: { '200': { description: 'Opportunity stage updated' } }
            }
          },
          '/api/crm/opportunities/{id}/status': {
            patch: {
              tags: ['CRM Opportunities'],
              summary: 'Update opportunity status',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['status', 'updatedById'],
                      properties: {
                        status: { type: 'string' },
                        updatedById: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: { '200': { description: 'Opportunity status updated' } }
            }
          },
          '/api/crm/activities': {
            get: {
              tags: ['CRM Activities'],
              summary: 'List activities',
              parameters: [
                { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'opportunityId', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'assignedToId', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'from', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
                { name: 'to', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } }
              ],
              responses: { '200': { description: 'Activities list' } }
            },
            post: {
              tags: ['CRM Activities'],
              summary: 'Create activity',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['opportunityId', 'title', 'assignedToId', 'createdById'],
                      properties: {
                        opportunityId: { type: 'string' },
                        title: { type: 'string' },
                        type: { type: 'string' },
                        status: { type: 'string' },
                        dueDate: { type: 'string', format: 'date-time', nullable: true },
                        details: { type: 'string', nullable: true },
                        assignedToId: { type: 'string' },
                        companyId: { type: 'string' },
                        createdById: { type: 'string' },
                        updatedById: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: { '201': { description: 'Activity created' } }
            }
          },
          '/api/crm/activities/{id}': {
            get: {
              tags: ['CRM Activities'],
              summary: 'Get activity by id',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Activity detail' } }
            },
            put: {
              tags: ['CRM Activities'],
              summary: 'Update activity',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['updatedById'],
                      properties: {
                        opportunityId: { type: 'string' },
                        title: { type: 'string' },
                        type: { type: 'string' },
                        status: { type: 'string' },
                        dueDate: { type: 'string', format: 'date-time', nullable: true },
                        details: { type: 'string', nullable: true },
                        assignedToId: { type: 'string' },
                        companyId: { type: 'string' },
                        updatedById: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: { '200': { description: 'Activity updated' } }
            },
            delete: {
              tags: ['CRM Activities'],
              summary: 'Cancel activity',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['updatedById'],
                      properties: { updatedById: { type: 'string' } }
                    }
                  }
                }
              },
              responses: { '200': { description: 'Activity cancelled' } }
            }
          },
          '/api/crm/activities/{id}/status': {
            patch: {
              tags: ['CRM Activities'],
              summary: 'Update activity status',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['status', 'updatedById'],
                      properties: {
                        status: { type: 'string' },
                        updatedById: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: { '200': { description: 'Activity status updated' } }
            }
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to build CRM OpenAPI document', details: error.message });
    }
  });

  router.get('/docs', async (req, res) => {
    if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sinapsis CRM API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api/crm/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true
      });
    </script>
  </body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const companyId = String(req.query.companyId || '').trim();
      const userId = String(req.query.userId || '').trim();
      const ctx = userId ? await resolveTenantAuthContext(pool, userId) : null;
      const organizationId = ctx?.organizationId || '';
      const companyCtx =
        ctx && companyId ? await resolveCompanyContextForRequest(pool, ctx, companyId) : null;

      const catMap = await fetchMergedItemsByCategoryCodes(pool, {
        codes: Object.values(CATEGORY_CODES),
        organizationId,
        companyIdContext: companyCtx,
        activeOnly: true
      });

      const usersResult = await pool.query(
        companyId
          ? 'SELECT id, name, "firstName", "lastName", email, "companyId" FROM "User" WHERE "companyId" = $1 ORDER BY "createdAt" ASC'
          : 'SELECT id, name, "firstName", "lastName", email, "companyId" FROM "User" ORDER BY "createdAt" ASC',
        companyId ? [companyId] : []
      );

      const leadsResult = await pool.query(
        companyId
          ? 'SELECT id, code, name, status, "companyId" FROM "Client" WHERE status = $1 AND "companyId" = $2 ORDER BY name ASC'
          : 'SELECT id, code, name, status, "companyId" FROM "Client" WHERE status = $1 ORDER BY name ASC',
        companyId ? ['Lead', companyId] : ['Lead']
      );

      const categories = {
        opportunityStages: catMap.get(CATEGORY_CODES.opportunityStages) || [],
        opportunityStatuses: catMap.get(CATEGORY_CODES.opportunityStatuses) || [],
        activityTypes: catMap.get(CATEGORY_CODES.activityTypes) || [],
        activityStatuses: catMap.get(CATEGORY_CODES.activityStatuses) || []
      };

      res.json({
        users: usersResult.rows.map((u: any) => ({
          ...u,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
        })),
        leads: leadsResult.rows,
        categories
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load CRM metadata', details: error.message });
    }
  });

  router.get('/overview', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const companyId = String(req.query.companyId || '').trim();

      const opportunitiesWhere: string[] = [];
      const opportunitiesParams: any[] = [];
      if (companyId) {
        opportunitiesParams.push(companyId);
        opportunitiesWhere.push(`o."companyId" = $${opportunitiesParams.length}`);
      }

      const opportunitiesWhereClause = opportunitiesWhere.length > 0 ? `WHERE ${opportunitiesWhere.join(' AND ')}` : '';

      const summaryResult = await pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE LOWER(o.status) NOT IN ('won', 'lost', 'archived')) as "openCount",
            COALESCE(SUM(CASE WHEN LOWER(o.status) NOT IN ('won', 'lost', 'archived') THEN o.amount ELSE 0 END), 0) as "pipelineValue",
            COALESCE(SUM(CASE WHEN LOWER(o.status) = 'won' AND date_trunc('month', COALESCE(o."closedAt", o."updatedAt")) = date_trunc('month', NOW()) THEN o.amount ELSE 0 END), 0) as "wonThisMonth"
          FROM "CrmOpportunity" o
          ${opportunitiesWhereClause}
        `,
        opportunitiesParams
      );

      const stageResult = await pool.query(
        `
          SELECT
            o.stage,
            COUNT(*)::int as "count",
            COALESCE(SUM(o.amount), 0) as "value"
          FROM "CrmOpportunity" o
          ${opportunitiesWhereClause}
          ${opportunitiesWhereClause ? 'AND' : 'WHERE'} LOWER(o.status) <> 'archived'
          GROUP BY o.stage
          ORDER BY COUNT(*) DESC, o.stage ASC
        `,
        opportunitiesParams
      );

      const leadResult = await pool.query(
        companyId
          ? 'SELECT COUNT(*)::int as "count" FROM "Client" WHERE status = $1 AND "companyId" = $2'
          : 'SELECT COUNT(*)::int as "count" FROM "Client" WHERE status = $1',
        companyId ? ['Lead', companyId] : ['Lead']
      );

      const activitiesResult = await pool.query(
        companyId
          ? 'SELECT COUNT(*)::int as "count" FROM "CrmActivity" WHERE LOWER(status) = $1 AND "companyId" = $2 AND "dueDate" IS NOT NULL AND "dueDate" < NOW()'
          : 'SELECT COUNT(*)::int as "count" FROM "CrmActivity" WHERE LOWER(status) = $1 AND "dueDate" IS NOT NULL AND "dueDate" < NOW()',
        companyId ? ['pending', companyId] : ['pending']
      );

      const upcomingActivitiesResult = await pool.query(
        `
          SELECT
            a.id,
            a.code,
            a.title,
            a.status,
            a.type,
            a."dueDate",
            o.code as "opportunityCode",
            o.title as "opportunityTitle",
            c.name as "clientName",
            assigned.name as "assignedToName"
          FROM "CrmActivity" a
          JOIN "CrmOpportunity" o ON o.id = a."opportunityId"
          JOIN "Client" c ON c.id = o."clientId"
          JOIN "User" assigned ON assigned.id = a."assignedToId"
          WHERE LOWER(a.status) = 'pending'
            AND a."dueDate" IS NOT NULL
            AND a."dueDate" >= NOW()
            ${companyId ? 'AND a."companyId" = $1' : ''}
          ORDER BY a."dueDate" ASC
          LIMIT 6
        `,
        companyId ? [companyId] : []
      );

      res.json({
        stats: {
          openOpportunities: Number(summaryResult.rows[0]?.openCount || 0),
          pipelineValue: toAmount(summaryResult.rows[0]?.pipelineValue),
          wonThisMonth: toAmount(summaryResult.rows[0]?.wonThisMonth),
          leadPool: Number(leadResult.rows[0]?.count || 0),
          overdueActivities: Number(activitiesResult.rows[0]?.count || 0)
        },
        byStage: stageResult.rows.map((row) => ({
          stage: row.stage,
          count: Number(row.count || 0),
          value: toAmount(row.value)
        })),
        upcomingActivities: upcomingActivitiesResult.rows
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load CRM overview', details: error.message });
    }
  });

  router.get('/opportunities', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const companyId = String(req.query.companyId || '').trim();
      const stage = String(req.query.stage || '').trim();
      const status = String(req.query.status || '').trim();
      const ownerId = String(req.query.ownerId || '').trim();
      const clientId = String(req.query.clientId || '').trim();
      const search = String(req.query.search || '').trim();

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        where.push(`o."companyId" = $${params.length}`);
      }
      if (stage) {
        params.push(stage);
        where.push(`o.stage = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`o.status = $${params.length}`);
      }
      if (ownerId) {
        params.push(ownerId);
        where.push(`o."ownerId" = $${params.length}`);
      }
      if (clientId) {
        params.push(clientId);
        where.push(`o."clientId" = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(
          LOWER(o.title) LIKE LOWER($${params.length})
          OR LOWER(o.code) LIKE LOWER($${params.length})
          OR LOWER(COALESCE(c.name, '')) LIKE LOWER($${params.length})
        )`);
      }

      const result = await pool.query(
        `
          SELECT
            o.*,
            c.code as "clientCode",
            c.name as "clientName",
            c.status as "clientStatus",
            owner.name as "ownerName",
            creator.name as "createdByName",
            updater.name as "updatedByName"
          FROM "CrmOpportunity" o
          JOIN "Client" c ON c.id = o."clientId"
          JOIN "User" owner ON owner.id = o."ownerId"
          JOIN "User" creator ON creator.id = o."createdById"
          JOIN "User" updater ON updater.id = o."updatedById"
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY o."expectedCloseDate" ASC NULLS LAST, o."createdAt" DESC
        `,
        params
      );

      res.json(result.rows.map(normalizeOpportunity));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch opportunities', details: error.message });
    }
  });

  router.get('/opportunities/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const opportunity = await getOpportunityById(String(req.params.id || '').trim());
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });

      res.json(opportunity);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch opportunity', details: error.message });
    }
  });

  router.post('/opportunities', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const title = String(req.body?.title || '').trim();
      const clientId = String(req.body?.clientId || '').trim();
      const ownerId = String(req.body?.ownerId || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;

      if (!title || !clientId || !ownerId || !createdById) {
        return res.status(400).json({ error: 'title, clientId, ownerId and createdById are required.' });
      }

      const clientResult = await pool.query('SELECT id, "companyId" FROM "Client" WHERE id = $1 LIMIT 1', [clientId]);
      const client = clientResult.rows[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });

      const companyId = String(req.body?.companyId || client.companyId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

      const id = crypto.randomUUID();
      const code = await nextOpportunityCode(companyId);
      const stage = String(req.body?.stage || 'Lead').trim() || 'Lead';
      const status = String(req.body?.status || statusFromStage(stage, 'Open')).trim() || 'Open';
      const closedAt = isClosedStatus(status)
        ? (toNullableIsoDate(req.body?.closedAt) || new Date().toISOString())
        : null;

      await pool.query(
        `
          INSERT INTO "CrmOpportunity" (
            id, code, title, "clientId", "companyId", "ownerId", stage, status,
            source, amount, probability, "expectedCloseDate", "closedAt", notes,
            "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12::timestamp, $13::timestamp, $14,
            $15, $16, NOW(), NOW()
          )
        `,
        [
          id,
          code,
          title,
          clientId,
          companyId,
          ownerId,
          stage,
          status,
          String(req.body?.source || '').trim() || null,
          toAmount(req.body?.amount),
          toProbability(req.body?.probability),
          toNullableIsoDate(req.body?.expectedCloseDate),
          closedAt,
          String(req.body?.notes || '').trim() || null,
          createdById,
          updatedById
        ]
      );

      const created = await getOpportunityById(id);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create opportunity', details: error.message });
    }
  });

  router.put('/opportunities/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const opportunityId = String(req.params.id || '').trim();
      const existing = await getOpportunityById(opportunityId);
      if (!existing) return res.status(404).json({ error: 'Opportunity not found' });

      const updatedById = String(req.body?.updatedById || '').trim();
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      const title = String(req.body?.title || existing.title || '').trim();
      const clientId = String(req.body?.clientId || existing.clientId || '').trim();
      const ownerId = String(req.body?.ownerId || existing.ownerId || '').trim();
      if (!title || !clientId || !ownerId) {
        return res.status(400).json({ error: 'title, clientId and ownerId are required.' });
      }

      const stage = String(req.body?.stage || existing.stage || 'Lead').trim() || 'Lead';
      const rawStatus = String(req.body?.status || existing.status || 'Open').trim() || 'Open';
      const status = statusFromStage(stage, rawStatus);
      const closedAt = isClosedStatus(status)
        ? (existing.closedAt || toNullableIsoDate(req.body?.closedAt) || new Date().toISOString())
        : null;

      const clientResult = await pool.query('SELECT id, "companyId" FROM "Client" WHERE id = $1 LIMIT 1', [clientId]);
      const client = clientResult.rows[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });

      const companyId = String(req.body?.companyId || existing.companyId || client.companyId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

      await pool.query(
        `
          UPDATE "CrmOpportunity"
          SET title = $1,
              "clientId" = $2,
              "companyId" = $3,
              "ownerId" = $4,
              stage = $5,
              status = $6,
              source = $7,
              amount = $8,
              probability = $9,
              "expectedCloseDate" = $10::timestamp,
              "closedAt" = $11::timestamp,
              notes = $12,
              "updatedById" = $13,
              "updatedAt" = NOW()
          WHERE id = $14
        `,
        [
          title,
          clientId,
          companyId,
          ownerId,
          stage,
          status,
          String(req.body?.source || existing.source || '').trim() || null,
          toAmount(req.body?.amount ?? existing.amount),
          toProbability(req.body?.probability ?? existing.probability),
          toNullableIsoDate(req.body?.expectedCloseDate || existing.expectedCloseDate),
          closedAt,
          String(req.body?.notes || existing.notes || '').trim() || null,
          updatedById,
          opportunityId
        ]
      );

      const updated = await getOpportunityById(opportunityId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update opportunity', details: error.message });
    }
  });

  router.patch('/opportunities/:id/move', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const opportunityId = String(req.params.id || '').trim();
      const stage = String(req.body?.stage || '').trim();
      const status = String(req.body?.status || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();

      if (!updatedById || (!stage && !status)) {
        return res.status(400).json({ error: 'updatedById and at least one of stage/status are required.' });
      }

      const existing = await getOpportunityById(opportunityId);
      if (!existing) return res.status(404).json({ error: 'Opportunity not found' });

      let nextStage = stage || String(existing.stage || 'Lead');
      let nextStatus = status || String(existing.status || 'Open');

      if (stage) {
        if (isWon(stage)) nextStatus = 'Won';
        if (isLost(stage)) nextStatus = 'Lost';
        if (!status && !isWon(stage) && !isLost(stage) && (isWon(nextStatus) || isLost(nextStatus) || String(nextStatus).toLowerCase() === 'archived')) {
          nextStatus = 'Open';
        }
      }

      if (status) {
        if (isWon(status)) nextStage = 'Won';
        if (isLost(status)) nextStage = 'Lost';
      }

      if (isWon(nextStage)) nextStatus = 'Won';
      if (isLost(nextStage)) nextStatus = 'Lost';
      if (!isWon(nextStage) && !isLost(nextStage) && isClosedStatus(nextStatus)) {
        nextStage = isWon(nextStatus) ? 'Won' : 'Lost';
      }

      const closedAt = isClosedStatus(nextStatus)
        ? (existing.closedAt || toNullableIsoDate(req.body?.closedAt) || new Date().toISOString())
        : null;

      await pool.query(
        'UPDATE "CrmOpportunity" SET stage = $1, status = $2, "closedAt" = $3::timestamp, "updatedById" = $4, "updatedAt" = NOW() WHERE id = $5',
        [nextStage, nextStatus, closedAt, updatedById, opportunityId]
      );

      const updated = await getOpportunityById(opportunityId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to move opportunity', details: error.message });
    }
  });
  router.patch('/opportunities/:id/stage', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const opportunityId = String(req.params.id || '').trim();
      const stage = String(req.body?.stage || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!stage || !updatedById) {
        return res.status(400).json({ error: 'stage and updatedById are required.' });
      }

      const existing = await getOpportunityById(opportunityId);
      if (!existing) return res.status(404).json({ error: 'Opportunity not found' });

      let nextStatus = String(existing.status || 'Open');
      if (isWon(stage)) nextStatus = 'Won';
      if (isLost(stage)) nextStatus = 'Lost';
      if (!isWon(stage) && !isLost(stage) && (isWon(nextStatus) || isLost(nextStatus) || String(nextStatus).toLowerCase() === 'archived')) {
        nextStatus = 'Open';
      }

      const closedAt = isClosedStatus(nextStatus)
        ? (existing.closedAt || new Date().toISOString())
        : null;

      await pool.query(
        'UPDATE "CrmOpportunity" SET stage = $1, status = $2, "closedAt" = $3::timestamp, "updatedById" = $4, "updatedAt" = NOW() WHERE id = $5',
        [stage, nextStatus, closedAt, updatedById, opportunityId]
      );

      const updated = await getOpportunityById(opportunityId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update opportunity stage', details: error.message });
    }
  });

  router.patch('/opportunities/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const opportunityId = String(req.params.id || '').trim();
      const status = String(req.body?.status || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!status || !updatedById) {
        return res.status(400).json({ error: 'status and updatedById are required.' });
      }

      const existing = await getOpportunityById(opportunityId);
      if (!existing) return res.status(404).json({ error: 'Opportunity not found' });

      let nextStage = String(existing.stage || 'Lead');
      if (isWon(status)) nextStage = 'Won';
      if (isLost(status)) nextStage = 'Lost';

      const closedAt = isClosedStatus(status)
        ? (existing.closedAt || new Date().toISOString())
        : null;

      await pool.query(
        'UPDATE "CrmOpportunity" SET stage = $1, status = $2, "closedAt" = $3::timestamp, "updatedById" = $4, "updatedAt" = NOW() WHERE id = $5',
        [nextStage, status, closedAt, updatedById, opportunityId]
      );

      const updated = await getOpportunityById(opportunityId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update opportunity status', details: error.message });
    }
  });

  router.delete('/opportunities/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const opportunityId = String(req.params.id || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      const existing = await getOpportunityById(opportunityId);
      if (!existing) return res.status(404).json({ error: 'Opportunity not found' });

      await pool.query(
        'UPDATE "CrmOpportunity" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        ['Archived', updatedById, opportunityId]
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to archive opportunity', details: error.message });
    }
  });

  router.get('/activities', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const companyId = String(req.query.companyId || '').trim();
      const opportunityId = String(req.query.opportunityId || '').trim();
      const assignedToId = String(req.query.assignedToId || '').trim();
      const status = String(req.query.status || '').trim();
      const search = String(req.query.search || '').trim();
      const from = toNullableIsoDate(req.query.from);
      const to = toNullableIsoDate(req.query.to);

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        where.push(`a."companyId" = $${params.length}`);
      }
      if (opportunityId) {
        params.push(opportunityId);
        where.push(`a."opportunityId" = $${params.length}`);
      }
      if (assignedToId) {
        params.push(assignedToId);
        where.push(`a."assignedToId" = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`a.status = $${params.length}`);
      }
      if (from) {
        params.push(from);
        where.push(`a."dueDate" >= $${params.length}::timestamp`);
      }
      if (to) {
        params.push(to);
        where.push(`a."dueDate" <= $${params.length}::timestamp`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(
          LOWER(a.title) LIKE LOWER($${params.length})
          OR LOWER(a.code) LIKE LOWER($${params.length})
          OR LOWER(COALESCE(o.code, '')) LIKE LOWER($${params.length})
          OR LOWER(COALESCE(c.name, '')) LIKE LOWER($${params.length})
        )`);
      }

      const result = await pool.query(
        `
          SELECT
            a.*,
            o.code as "opportunityCode",
            o.title as "opportunityTitle",
            c.id as "clientId",
            c.name as "clientName",
            assigned.name as "assignedToName",
            creator.name as "createdByName",
            updater.name as "updatedByName"
          FROM "CrmActivity" a
          JOIN "CrmOpportunity" o ON o.id = a."opportunityId"
          JOIN "Client" c ON c.id = o."clientId"
          JOIN "User" assigned ON assigned.id = a."assignedToId"
          JOIN "User" creator ON creator.id = a."createdById"
          JOIN "User" updater ON updater.id = a."updatedById"
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY a."dueDate" ASC NULLS LAST, a."createdAt" DESC
        `,
        params
      );

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch activities', details: error.message });
    }
  });

  router.get('/activities/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const activity = await getActivityById(String(req.params.id || '').trim());
      if (!activity) return res.status(404).json({ error: 'Activity not found' });

      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch activity', details: error.message });
    }
  });

  router.post('/activities', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const opportunityId = String(req.body?.opportunityId || '').trim();
      const title = String(req.body?.title || '').trim();
      const assignedToId = String(req.body?.assignedToId || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;

      if (!opportunityId || !title || !assignedToId || !createdById) {
        return res.status(400).json({ error: 'opportunityId, title, assignedToId and createdById are required.' });
      }

      const opportunityResult = await pool.query('SELECT id, "companyId" FROM "CrmOpportunity" WHERE id = $1 LIMIT 1', [opportunityId]);
      const opportunity = opportunityResult.rows[0];
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });

      const activityCompanyId = String(req.body?.companyId || opportunity.companyId || '').trim();
      if (!activityCompanyId) return res.status(400).json({ error: 'companyId is required.' });

      const id = crypto.randomUUID();
      const code = await nextActivityCode(activityCompanyId);
      const status = String(req.body?.status || 'Pending').trim() || 'Pending';
      const completedAt = String(status).toLowerCase() === 'completed'
        ? (toNullableIsoDate(req.body?.completedAt) || new Date().toISOString())
        : null;

      await pool.query(
        `
          INSERT INTO "CrmActivity" (
            id, code, "opportunityId", "companyId", title, type, status,
            "dueDate", "completedAt", details,
            "assignedToId", "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::timestamp, $9::timestamp, $10,
            $11, $12, $13, NOW(), NOW()
          )
        `,
        [
          id,
          code,
          opportunityId,
          activityCompanyId,
          title,
          String(req.body?.type || 'Task').trim() || 'Task',
          status,
          toNullableIsoDate(req.body?.dueDate),
          completedAt,
          String(req.body?.details || '').trim() || null,
          assignedToId,
          createdById,
          updatedById
        ]
      );

      const created = await getActivityById(id);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create activity', details: error.message });
    }
  });

  router.put('/activities/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const activityId = String(req.params.id || '').trim();
      const existing = await getActivityById(activityId);
      if (!existing) return res.status(404).json({ error: 'Activity not found' });

      const updatedById = String(req.body?.updatedById || '').trim();
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      const opportunityId = String(req.body?.opportunityId || existing.opportunityId || '').trim();
      const title = String(req.body?.title || existing.title || '').trim();
      const assignedToId = String(req.body?.assignedToId || existing.assignedToId || '').trim();

      if (!opportunityId || !title || !assignedToId) {
        return res.status(400).json({ error: 'opportunityId, title and assignedToId are required.' });
      }

      const opportunityResult = await pool.query('SELECT id, "companyId" FROM "CrmOpportunity" WHERE id = $1 LIMIT 1', [opportunityId]);
      const opportunity = opportunityResult.rows[0];
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });

      const status = String(req.body?.status || existing.status || 'Pending').trim() || 'Pending';
      const completedAt = String(status).toLowerCase() === 'completed'
        ? (toNullableIsoDate(req.body?.completedAt || existing.completedAt) || new Date().toISOString())
        : null;

      await pool.query(
        `
          UPDATE "CrmActivity"
          SET "opportunityId" = $1,
              "companyId" = $2,
              title = $3,
              type = $4,
              status = $5,
              "dueDate" = $6::timestamp,
              "completedAt" = $7::timestamp,
              details = $8,
              "assignedToId" = $9,
              "updatedById" = $10,
              "updatedAt" = NOW()
          WHERE id = $11
        `,
        [
          opportunityId,
          String(req.body?.companyId || opportunity.companyId || existing.companyId || '').trim(),
          title,
          String(req.body?.type || existing.type || 'Task').trim() || 'Task',
          status,
          toNullableIsoDate(req.body?.dueDate || existing.dueDate),
          completedAt,
          String(req.body?.details || existing.details || '').trim() || null,
          assignedToId,
          updatedById,
          activityId
        ]
      );

      const updated = await getActivityById(activityId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update activity', details: error.message });
    }
  });

  router.patch('/activities/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const activityId = String(req.params.id || '').trim();
      const status = String(req.body?.status || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();

      if (!status || !updatedById) {
        return res.status(400).json({ error: 'status and updatedById are required.' });
      }

      const existing = await getActivityById(activityId);
      if (!existing) return res.status(404).json({ error: 'Activity not found' });

      const completedAt = String(status).toLowerCase() === 'completed'
        ? (existing.completedAt || new Date().toISOString())
        : null;

      await pool.query(
        'UPDATE "CrmActivity" SET status = $1, "completedAt" = $2::timestamp, "updatedById" = $3, "updatedAt" = NOW() WHERE id = $4',
        [status, completedAt, updatedById, activityId]
      );

      const updated = await getActivityById(activityId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update activity status', details: error.message });
    }
  });

  router.delete('/activities/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'CRM module is not active.' });

      const activityId = String(req.params.id || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      const existing = await getActivityById(activityId);
      if (!existing) return res.status(404).json({ error: 'Activity not found' });

      await pool.query(
        'UPDATE "CrmActivity" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        ['Cancelled', updatedById, activityId]
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to cancel activity', details: error.message });
    }
  });

  app.use('/api/crm', router);

  return { basePath: '/api/crm', openapiPath: '/api/crm/openapi.json', docsPath: '/api/crm/docs' };
}






