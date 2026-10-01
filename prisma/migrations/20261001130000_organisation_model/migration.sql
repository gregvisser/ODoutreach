-- Organisation model. Additive and safe to re-run.
--
-- Creates the OpensDoors organisation, points every existing client at it,
-- then makes Client.organisationId required. Existing staff become members.
-- A Bidlow super-admin (verified @bidlow.co.uk email AND isSuperAdmin) receives
-- the platform-admin flag. Nobody else's access changes: nothing reads these
-- columns yet.
--
-- The column default stays org_opensdoors so inserts that omit the column
-- (Prisma creates that have not been updated, and raw SQL in tests) remain
-- OpensDoors clients.

DO $$
BEGIN
  CREATE TYPE "OrganisationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "OrganisationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'USER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "Organisation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "OrganisationStatus" NOT NULL DEFAULT 'ACTIVE',
  "appLogoUrl" TEXT,
  "appMarkUrl" TEXT,
  "appFaviconUrl" TEXT,
  "appBrandName" TEXT,
  "appProductName" TEXT,
  "appLogoAltText" TEXT,
  "featureFlags" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organisation_slug_key" ON "Organisation"("slug");
CREATE INDEX IF NOT EXISTS "Organisation_status_idx" ON "Organisation"("status");

-- OpensDoors feature flags match today's effective behaviour: every switch
-- is on, and the existing environment variables remain the emergency brake
-- once enforcement lands. Missing keys also resolve to on.
INSERT INTO "Organisation" (
  "id",
  "name",
  "slug",
  "status",
  "featureFlags",
  "createdAt",
  "updatedAt"
)
VALUES (
  'org_opensdoors',
  'OpensDoors',
  'opensdoors',
  'ACTIVE',
  '{"aiCampaigns":true,"aiDraftingReview":true,"rocketReachBuying":true,"universe":true,"supportDesk":true,"machineSending":true,"humanSending":true,"followUps":true}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- Copy whatever brand an admin already saved. Null columns stay null so the
-- app keeps its shipped OpensDoors fallback. Re-runs only fill blanks.
UPDATE "Organisation" AS organisation
SET
  "appLogoUrl" = COALESCE(organisation."appLogoUrl", brand."appLogoUrl"),
  "appMarkUrl" = COALESCE(organisation."appMarkUrl", brand."appMarkUrl"),
  "appFaviconUrl" = COALESCE(organisation."appFaviconUrl", brand."appFaviconUrl"),
  "appBrandName" = COALESCE(organisation."appBrandName", brand."appBrandName"),
  "appProductName" = COALESCE(organisation."appProductName", brand."appProductName"),
  "appLogoAltText" = COALESCE(organisation."appLogoAltText", brand."appLogoAltText"),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "GlobalBrandSetting" AS brand
WHERE organisation."id" = 'org_opensdoors'
  AND brand."id" = 'global'
  AND (
    organisation."appLogoUrl" IS NULL
    OR organisation."appMarkUrl" IS NULL
    OR organisation."appFaviconUrl" IS NULL
    OR organisation."appBrandName" IS NULL
    OR organisation."appProductName" IS NULL
    OR organisation."appLogoAltText" IS NULL
  );

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;

UPDATE "Client"
SET "organisationId" = 'org_opensdoors'
WHERE "organisationId" IS NULL;

ALTER TABLE "Client" ALTER COLUMN "organisationId" SET DEFAULT 'org_opensdoors';
ALTER TABLE "Client" ALTER COLUMN "organisationId" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "Client"
    ADD CONSTRAINT "Client_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "Client_organisationId_idx" ON "Client"("organisationId");

ALTER TABLE "StaffUser" ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "StaffUser"
SET "isPlatformAdmin" = true
WHERE "isSuperAdmin" = true
  AND lower("email") LIKE '%@bidlow.co.uk'
  AND "isPlatformAdmin" = false;

CREATE TABLE IF NOT EXISTS "OrganisationMember" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "staffUserId" TEXT NOT NULL,
  "role" "OrganisationMemberRole" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganisationMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganisationMember_staffUserId_key" ON "OrganisationMember"("staffUserId");
CREATE INDEX IF NOT EXISTS "OrganisationMember_organisationId_idx" ON "OrganisationMember"("organisationId");

DO $$
BEGIN
  ALTER TABLE "OrganisationMember"
    ADD CONSTRAINT "OrganisationMember_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "OrganisationMember"
    ADD CONSTRAINT "OrganisationMember_staffUserId_fkey"
    FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

INSERT INTO "OrganisationMember" (
  "id",
  "organisationId",
  "staffUserId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  'orgmem_' || staff."id",
  'org_opensdoors',
  staff."id",
  CASE
    WHEN staff."isSuperAdmin" THEN 'OWNER'::"OrganisationMemberRole"
    WHEN staff."role" = 'ADMIN' THEN 'ADMIN'::"OrganisationMemberRole"
    ELSE 'USER'::"OrganisationMemberRole"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "StaffUser" AS staff
ON CONFLICT ("staffUserId") DO NOTHING;
