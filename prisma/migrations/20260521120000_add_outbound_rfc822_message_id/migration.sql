-- Additive: RFC 5322 Message-ID stamped on outbound emails, so inbound replies
-- can link back to the exact send via their In-Reply-To header.

ALTER TABLE "OutboundEmail" ADD COLUMN "rfc822MessageId" TEXT;

CREATE INDEX "OutboundEmail_clientId_rfc822MessageId_idx" ON "OutboundEmail"("clientId", "rfc822MessageId");
