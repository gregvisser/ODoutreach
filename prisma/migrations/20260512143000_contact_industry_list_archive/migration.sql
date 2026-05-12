-- Additive: industry on contacts + universe; soft-archive timestamp on client lists.

ALTER TABLE "ContactUniverse" ADD COLUMN "industry" TEXT;

ALTER TABLE "Contact" ADD COLUMN "industry" TEXT;

ALTER TABLE "ContactList" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "ContactList_clientId_archivedAt_idx" ON "ContactList"("clientId", "archivedAt");
