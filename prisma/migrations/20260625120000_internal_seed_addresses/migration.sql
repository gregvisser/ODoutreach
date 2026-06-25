-- Feature A (production hardening) — global internal seed / allowlist.
--
-- ADDITIVE + REVERSIBLE. Creates one new table and seeds 6 OpensDoors-internal
-- test addresses. No existing table is read or rewritten, so this is safe to
-- apply online (staging first, per the hardening engagement constraints).
--
-- The feature is INERT until INTERNAL_SEED_ALLOWLIST_ENABLED=true: with the
-- flag off, no application code reads this table and the live send path is
-- unchanged. Creating/seeding the table while the flag is off is therefore a
-- no-op for behaviour.
--
-- ROLLBACK (safe, no data loss elsewhere):
--   DROP TABLE "InternalSeedAddress";
-- The table has no inbound foreign keys, so the drop is clean.

CREATE TABLE "InternalSeedAddress" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalSeedAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InternalSeedAddress_email_key" ON "InternalSeedAddress"("email");

CREATE INDEX "InternalSeedAddress_isActive_idx" ON "InternalSeedAddress"("isActive");

-- Seed the 6 internal test addresses (normalized lowercase). Idempotent via
-- ON CONFLICT so a re-run (or a row already added via the admin UI) is a no-op.
-- Stable string ids (not cuid) so the seed is deterministic and re-runnable.
INSERT INTO "InternalSeedAddress" ("id", "email", "label", "note", "isActive", "updatedAt")
VALUES
    ('seed_adam',     'adam@opensdoors.co.uk',     'Adam (internal test)',     'Internal test address — always deliverable', true, CURRENT_TIMESTAMP),
    ('seed_elys',     'elys@opensdoors.co.uk',     'Elys (internal test)',     'Internal test address — always deliverable', true, CURRENT_TIMESTAMP),
    ('seed_lucysg',   'lucysg@opensdoors.co.uk',   'Lucy SG (internal test)',  'Internal test address — always deliverable', true, CURRENT_TIMESTAMP),
    ('seed_james',    'james@opensdoors.co.uk',    'James (internal test)',    'Internal test address — always deliverable', true, CURRENT_TIMESTAMP),
    ('seed_joe',      'joe@opensdoors.co.uk',      'Joe (internal test)',      'Internal test address — always deliverable', true, CURRENT_TIMESTAMP),
    ('seed_samantha', 'samantha@opensdoors.co.uk', 'Samantha (internal test)', 'Internal test address — always deliverable', true, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;
