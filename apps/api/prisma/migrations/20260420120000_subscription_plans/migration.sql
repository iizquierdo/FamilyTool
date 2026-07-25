-- Subscription catalog and required organization plan assignment.

CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "billingPeriod" TEXT NOT NULL DEFAULT 'Monthly',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "badgeLabel" TEXT,
    "maxUsers" INTEGER,
    "maxCompanies" INTEGER,
    "maxStorageMb" INTEGER,
    "maxApiCallsPerDay" INTEGER,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

INSERT INTO "SubscriptionPlan" (
    "id",
    "code",
    "name",
    "description",
    "status",
    "sortOrder",
    "billingPeriod",
    "priceCents",
    "currency",
    "trialDays",
    "badgeLabel",
    "maxUsers",
    "maxCompanies",
    "maxStorageMb",
    "maxApiCallsPerDay",
    "features",
    "createdAt",
    "updatedAt"
) VALUES (
    '11111111-1111-4111-8111-111111111111',
    'FREE',
    'Free',
    'Plan gratuito por defecto ($0).',
    'Active',
    0,
    'Lifetime',
    0,
    'USD',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

ALTER TABLE "Organization" ADD COLUMN "subscriptionPlanId" TEXT;

UPDATE "Organization" o
SET "subscriptionPlanId" = p."id"
FROM "SubscriptionPlan" p
WHERE p."code" = 'FREE'
  AND o."subscriptionPlanId" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "subscriptionPlanId" SET NOT NULL;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_subscriptionPlanId_fkey"
  FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Organization_subscriptionPlanId_idx" ON "Organization"("subscriptionPlanId");
