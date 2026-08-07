-- OrganiHogar: gamificación — rachas (streaks) e insignias (badges). Idempotente.

CREATE TABLE IF NOT EXISTS "UserStreak" (
    "userId"            TEXT NOT NULL,
    "companyId"         TEXT NOT NULL,
    "currentStreak"     INTEGER NOT NULL DEFAULT 0,
    "longestStreak"     INTEGER NOT NULL DEFAULT 0,
    "lastCompletedDate" DATE,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStreak_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "Badge" (
    "id"          TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "icon"        TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Badge_code_key" ON "Badge"("code");

CREATE TABLE IF NOT EXISTS "UserBadge" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "badgeId"   TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");
CREATE INDEX IF NOT EXISTS "UserBadge_userId_idx" ON "UserBadge"("userId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserStreak_userId_fkey') THEN
        ALTER TABLE "UserStreak" ADD CONSTRAINT "UserStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserBadge_userId_fkey') THEN
        ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserBadge_badgeId_fkey') THEN
        ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
