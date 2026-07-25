-- CreateTable
CREATE TABLE "Core" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "appName" TEXT NOT NULL DEFAULT 'Sinapsis CRM/ERP',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#eb4d4b',
    "secondaryColor" TEXT NOT NULL DEFAULT '#f4f4f5',
    "menuBarIcon" TEXT NOT NULL DEFAULT 'fa-bars',
    "menuBarColor" TEXT NOT NULL DEFAULT '',
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYY/MM/DD',
    "timeFormat" TEXT NOT NULL DEFAULT 'HH:mm',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "baseCurrency" TEXT DEFAULT 'USD',
    "moneyFormat" TEXT NOT NULL DEFAULT '1,234.56',
    "currencyPosition" TEXT NOT NULL DEFAULT 'Prefix',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'es',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Core_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Core" ("id")
VALUES (1)
ON CONFLICT ("id") DO NOTHING;
