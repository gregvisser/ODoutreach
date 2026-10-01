-- A person can belong to more than one organisation.
-- The old unique index on staffUserId made a second membership impossible,
-- and the audit trigger assumed that index by selecting one row.

DROP INDEX IF EXISTS "OrganisationMember_staffUserId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "OrganisationMember_organisationId_staffUserId_key"
  ON "OrganisationMember"("organisationId", "staffUserId");

CREATE INDEX IF NOT EXISTS "OrganisationMember_staffUserId_idx"
  ON "OrganisationMember"("staffUserId");

-- Assign an organisation only when the writer did not, and only when that
-- person belongs to exactly one organisation. More than one membership must
-- not throw, and must not guess an organisation.
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
    SELECT CASE
      WHEN COUNT(*) = 1 THEN MIN("organisationId")
      ELSE NULL
    END
    INTO NEW."organisationId"
    FROM "OrganisationMember"
    WHERE "staffUserId" = NEW."staffUserId";
  END IF;
  RETURN NEW;
END;
$$;
