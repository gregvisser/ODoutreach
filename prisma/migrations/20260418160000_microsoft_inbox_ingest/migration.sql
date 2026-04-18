-- Inbox rows from Microsoft Graph (Mail.Read) — idempotent by mailbox + Graph message id

CREATE TABLE "InboundMailboxMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mailboxIdentityId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "bodyPreview" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "conversationId" TEXT,
    "ingestionSource" TEXT NOT NULL DEFAULT 'MICROSOFT_GRAPH',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMailboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundMailboxMessage_mailboxIdentityId_providerMessageId_key" ON "InboundMailboxMessage"("mailboxIdentityId", "providerMessageId");

CREATE INDEX "InboundMailboxMessage_clientId_receivedAt_idx" ON "InboundMailboxMessage"("clientId", "receivedAt");

CREATE INDEX "InboundMailboxMessage_mailboxIdentityId_receivedAt_idx" ON "InboundMailboxMessage"("mailboxIdentityId", "receivedAt");

ALTER TABLE "InboundMailboxMessage" ADD CONSTRAINT "InboundMailboxMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundMailboxMessage" ADD CONSTRAINT "InboundMailboxMessage_mailboxIdentityId_fkey" FOREIGN KEY ("mailboxIdentityId") REFERENCES "ClientMailboxIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
