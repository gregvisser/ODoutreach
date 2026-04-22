-- PR M — One-click unsubscribe tokens (additive only).
--
-- Adds `UnsubscribeToken` storage for one-click unsubscribe links.
-- Raw tokens are never stored; only SHA-256 hashes are persisted so a
-- leaked database dump cannot be used to forge unsubscribe links for
-- other recipients. The token is email-scoped to a single client +
-- (optionally) a specific outbound message so an operator audit can
-- trace every redemption.
--
-- Safety:
--   * Additive only — no existing table is altered, no row is rewritten.
--   * `contactId` + `outboundEmailId` are nullable to tolerate contact/
--     outbound deletions without invalidating historical tokens.
--   * No sends, imports, or suppression syncs are triggered by this
--     migration.

-- CreateTable
CREATE TABLE "UnsubscribeToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "outboundEmailId" TEXT,
    "email" TEXT NOT NULL,
    "emailDomain" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'outreach_unsubscribe',
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnsubscribeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnsubscribeToken_tokenHash_key" ON "UnsubscribeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UnsubscribeToken_clientId_idx" ON "UnsubscribeToken"("clientId");

-- CreateIndex
CREATE INDEX "UnsubscribeToken_email_idx" ON "UnsubscribeToken"("email");

-- CreateIndex
CREATE INDEX "UnsubscribeToken_contactId_idx" ON "UnsubscribeToken"("contactId");

-- CreateIndex
CREATE INDEX "UnsubscribeToken_outboundEmailId_idx" ON "UnsubscribeToken"("outboundEmailId");

-- AddForeignKey
ALTER TABLE "UnsubscribeToken"
    ADD CONSTRAINT "UnsubscribeToken_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnsubscribeToken"
    ADD CONSTRAINT "UnsubscribeToken_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnsubscribeToken"
    ADD CONSTRAINT "UnsubscribeToken_outboundEmailId_fkey"
    FOREIGN KEY ("outboundEmailId") REFERENCES "OutboundEmail"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
