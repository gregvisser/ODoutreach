-- Additive: outbound mailbox attribution + per-mailbox UTC-daily cap ledger
CREATE TYPE "MailboxSendReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- Forward-only: new governed sends reference this; legacy rows stay NULL
ALTER TABLE "OutboundEmail" ADD COLUMN "mailboxIdentityId" TEXT;
CREATE INDEX "OutboundEmail_mailboxIdentityId_sentAt_idx" ON "OutboundEmail"("mailboxIdentityId", "sentAt");
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_mailboxIdentityId_fkey" FOREIGN KEY ("mailboxIdentityId") REFERENCES "ClientMailboxIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MailboxSendReservation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mailboxIdentityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "status" "MailboxSendReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "outboundEmailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxSendReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailboxSendReservation_outboundEmailId_key" ON "MailboxSendReservation"("outboundEmailId");
CREATE INDEX "MailboxSendReservation_mailboxIdentityId_windowKey_status_idx" ON "MailboxSendReservation"("mailboxIdentityId", "windowKey", "status");
CREATE INDEX "MailboxSendReservation_clientId_createdAt_idx" ON "MailboxSendReservation"("clientId", "createdAt");
CREATE UNIQUE INDEX "MailboxSendReservation_mailboxIdentityId_windowKey_idempotencyKey_key" ON "MailboxSendReservation"("mailboxIdentityId", "windowKey", "idempotencyKey");

ALTER TABLE "MailboxSendReservation" ADD CONSTRAINT "MailboxSendReservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailboxSendReservation" ADD CONSTRAINT "MailboxSendReservation_mailboxIdentityId_fkey" FOREIGN KEY ("mailboxIdentityId") REFERENCES "ClientMailboxIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailboxSendReservation" ADD CONSTRAINT "MailboxSendReservation_outboundEmailId_fkey" FOREIGN KEY ("outboundEmailId") REFERENCES "OutboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
