-- RULING 3 (Greg, 2026-08-24) — do-not-contact may cover RELATED COMPANY
-- domains, but only ones a human has explicitly listed for that client.
--
-- HAND-TRIMMED, DELIBERATELY. `prisma migrate dev` generated this file with six
-- additional statements that have nothing to do with this feature:
--   DROP INDEX   "OutboundProviderEvent_clientId_createdAt_idx"
--   ALTER TABLE  "InboundMailboxMessage" ALTER COLUMN "updatedAt" DROP DEFAULT
--   ALTER TABLE  "OutboundEmail"         ALTER COLUMN "updatedAt" DROP DEFAULT
--   CREATE INDEX "OutboundEmail_correlationId_idx"
--   CREATE INDEX "OutboundProviderEvent_clientId_receivedAt_idx"
--   ALTER INDEX  "MailboxSendReservation_..." RENAME TO ...
--
-- Those are PRE-EXISTING DRIFT between prisma/schema.prisma and the migration
-- history — verified 2026-08-24: two of those indexes appear in no migration at
-- all, and the dropped one was created by 20260416120000_outbound_queue_lifecycle.
-- They were removed from this file because `deploy-production.yml` runs
-- `prisma migrate deploy` against the PRODUCTION database BEFORE the Azure login
-- step, and a feature migration must not carry unrelated index drops, index
-- renames and default removals onto live tables as a side effect.
--
-- The drift is real and still needs fixing. It needs its own deliberate,
-- reviewed migration — not a free ride on this one.

-- CreateTable
CREATE TABLE "SuppressedDomainFamily" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressedDomainFamily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuppressedDomainFamily_clientId_label_idx" ON "SuppressedDomainFamily"("clientId", "label");

-- CreateIndex: a domain belongs to at most one family per client, otherwise
-- "which family is bteurope.com in" has no answer and the gate is ambiguous.
CREATE UNIQUE INDEX "SuppressedDomainFamily_clientId_domain_key" ON "SuppressedDomainFamily"("clientId", "domain");

-- AddForeignKey: cascade with the workspace. A departed client's family list
-- must not outlive the client it belonged to.
ALTER TABLE "SuppressedDomainFamily" ADD CONSTRAINT "SuppressedDomainFamily_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SET NULL, not cascade — removing a staff account must never
-- silently delete the do-not-contact entries they created.
ALTER TABLE "SuppressedDomainFamily" ADD CONSTRAINT "SuppressedDomainFamily_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
