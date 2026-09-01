-- Row 159 (raised by row 136, cycle 197, finding 6): support tickets had no
-- reply/comment thread, so a developer could not ask a clarifying question or
-- narrate progress before resolving a ticket.
--
-- ADDITIVE ONLY. One new table, one new foreign key to the existing
-- SupportTicket and StaffUser tables. Nothing existing is dropped, altered,
-- rewritten or backfilled, and dropping this table restores today's
-- behaviour exactly: no existing code path reads or writes it.

CREATE TABLE "SupportTicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorStaffUserId" TEXT,
    "authorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicketComment_ticketId_createdAt_idx" ON "SupportTicketComment"("ticketId", "createdAt");

ALTER TABLE "SupportTicketComment" ADD CONSTRAINT "SupportTicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportTicketComment" ADD CONSTRAINT "SupportTicketComment_authorStaffUserId_fkey" FOREIGN KEY ("authorStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
