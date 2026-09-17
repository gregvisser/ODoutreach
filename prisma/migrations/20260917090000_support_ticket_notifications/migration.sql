CREATE TYPE "SupportTicketNotificationStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'ACCEPTED', 'FAILED', 'UNKNOWN');

ALTER TABLE "SupportTicket"
  ADD COLUMN "resolutionVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "SupportTicketNotification" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "resolutionVersion" INTEGER NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "SupportTicketNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "providerAcceptedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicketNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicketNotification_ticketId_resolutionVersion_key"
  ON "SupportTicketNotification"("ticketId", "resolutionVersion");
CREATE INDEX "SupportTicketNotification_status_nextAttemptAt_idx"
  ON "SupportTicketNotification"("status", "nextAttemptAt");
CREATE INDEX "SupportTicketNotification_ticketId_idx"
  ON "SupportTicketNotification"("ticketId");
ALTER TABLE "SupportTicketNotification"
  ADD CONSTRAINT "SupportTicketNotification_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
