-- Safe soft-removal: preserve OutboundEmail / InboundMailboxMessage / AuditLog links; clear operational use via flags + removed timestamps.

ALTER TABLE "ClientMailboxIdentity" ADD COLUMN "workspaceRemovedAt" TIMESTAMP(3),
ADD COLUMN "workspaceRemovedById" TEXT,
ADD COLUMN "workspaceRemovedNote" VARCHAR(2000);

ALTER TABLE "ClientMailboxIdentity" ADD CONSTRAINT "ClientMailboxIdentity_workspaceRemovedById_fkey" FOREIGN KEY ("workspaceRemovedById") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ClientMailboxIdentity_clientId_workspaceRemovedAt_idx" ON "ClientMailboxIdentity"("clientId", "workspaceRemovedAt");

CREATE INDEX "ClientMailboxIdentity_workspaceRemovedById_idx" ON "ClientMailboxIdentity"("workspaceRemovedById");
