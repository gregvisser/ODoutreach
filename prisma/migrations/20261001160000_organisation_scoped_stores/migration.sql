-- Organisation-scoped stores. Additive and safe to re-run.
--
-- Contact universe, internal seed addresses, and support tickets gain a
-- required organisationId (default OpensDoors). Audit logs and AI usage
-- events gain a nullable organisationId filled from the client, or for an
-- audit row with no client, from the staff member's membership.
--
-- Existing OpensDoors rows stay on OpensDoors. Nothing is deleted.

-- Contact universe -----------------------------------------------------------

ALTER TABLE "ContactUniverse" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;

UPDATE "ContactUniverse" AS universe
SET "organisationId" = client."organisationId"
FROM "Client" AS client
WHERE universe."firstSeenClientId" = client."id"
  AND universe."organisationId" IS NULL;

UPDATE "ContactUniverse"
SET "organisationId" = 'org_opensdoors'
WHERE "organisationId" IS NULL;

ALTER TABLE "ContactUniverse" ALTER COLUMN "organisationId" SET DEFAULT 'org_opensdoors';
ALTER TABLE "ContactUniverse" ALTER COLUMN "organisationId" SET NOT NULL;

DROP INDEX IF EXISTS "ContactUniverse_emailNormalized_key";
DROP INDEX IF EXISTS "ContactUniverse_weakMatchKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ContactUniverse_organisationId_emailNormalized_key"
  ON "ContactUniverse"("organisationId", "emailNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "ContactUniverse_organisationId_weakMatchKey_key"
  ON "ContactUniverse"("organisationId", "weakMatchKey");
CREATE INDEX IF NOT EXISTS "ContactUniverse_organisationId_idx"
  ON "ContactUniverse"("organisationId");

DO $$
BEGIN
  ALTER TABLE "ContactUniverse"
    ADD CONSTRAINT "ContactUniverse_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Internal seed addresses ----------------------------------------------------

ALTER TABLE "InternalSeedAddress" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;

UPDATE "InternalSeedAddress"
SET "organisationId" = 'org_opensdoors'
WHERE "organisationId" IS NULL;

ALTER TABLE "InternalSeedAddress" ALTER COLUMN "organisationId" SET DEFAULT 'org_opensdoors';
ALTER TABLE "InternalSeedAddress" ALTER COLUMN "organisationId" SET NOT NULL;

DROP INDEX IF EXISTS "InternalSeedAddress_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "InternalSeedAddress_organisationId_email_key"
  ON "InternalSeedAddress"("organisationId", "email");
CREATE INDEX IF NOT EXISTS "InternalSeedAddress_organisationId_isActive_idx"
  ON "InternalSeedAddress"("organisationId", "isActive");

DO $$
BEGIN
  ALTER TABLE "InternalSeedAddress"
    ADD CONSTRAINT "InternalSeedAddress_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Support tickets ------------------------------------------------------------

ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;

UPDATE "SupportTicket" AS ticket
SET "organisationId" = member."organisationId"
FROM "OrganisationMember" AS member
WHERE ticket."createdByStaffUserId" = member."staffUserId"
  AND ticket."organisationId" IS NULL;

UPDATE "SupportTicket"
SET "organisationId" = 'org_opensdoors'
WHERE "organisationId" IS NULL;

ALTER TABLE "SupportTicket" ALTER COLUMN "organisationId" SET DEFAULT 'org_opensdoors';
ALTER TABLE "SupportTicket" ALTER COLUMN "organisationId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SupportTicket_organisationId_createdAt_idx"
  ON "SupportTicket"("organisationId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Audit log ------------------------------------------------------------------

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;

UPDATE "AuditLog" AS audit
SET "organisationId" = client."organisationId"
FROM "Client" AS client
WHERE audit."clientId" = client."id"
  AND audit."organisationId" IS NULL;

UPDATE "AuditLog" AS audit
SET "organisationId" = member."organisationId"
FROM "OrganisationMember" AS member
WHERE audit."staffUserId" = member."staffUserId"
  AND audit."organisationId" IS NULL;

CREATE INDEX IF NOT EXISTS "AuditLog_organisationId_createdAt_idx"
  ON "AuditLog"("organisationId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE FUNCTION assign_audit_log_organisation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organisationId" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."clientId" IS NOT NULL THEN
    SELECT "organisationId" INTO NEW."organisationId"
    FROM "Client"
    WHERE "id" = NEW."clientId";
  END IF;
  IF NEW."organisationId" IS NULL AND NEW."staffUserId" IS NOT NULL THEN
    SELECT "organisationId" INTO NEW."organisationId"
    FROM "OrganisationMember"
    WHERE "staffUserId" = NEW."staffUserId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_assign_organisation ON "AuditLog";
CREATE TRIGGER audit_log_assign_organisation
BEFORE INSERT ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION assign_audit_log_organisation();

-- AI usage -------------------------------------------------------------------

ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;

UPDATE "AiUsageEvent" AS usage
SET "organisationId" = client."organisationId"
FROM "Client" AS client
WHERE usage."clientId" = client."id"
  AND usage."organisationId" IS NULL;

CREATE INDEX IF NOT EXISTS "AiUsageEvent_organisationId_createdAt_idx"
  ON "AiUsageEvent"("organisationId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "AiUsageEvent"
    ADD CONSTRAINT "AiUsageEvent_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE FUNCTION assign_ai_usage_organisation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organisationId" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."clientId" IS NOT NULL THEN
    SELECT "organisationId" INTO NEW."organisationId"
    FROM "Client"
    WHERE "id" = NEW."clientId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_usage_assign_organisation ON "AiUsageEvent";
CREATE TRIGGER ai_usage_assign_organisation
BEFORE INSERT ON "AiUsageEvent"
FOR EACH ROW
EXECUTE FUNCTION assign_ai_usage_organisation();
