-- Mailbox OAuth: pending state fields, provider link metadata, encrypted credential row

ALTER TABLE "ClientMailboxIdentity" ADD COLUMN "oauthState" TEXT;
ALTER TABLE "ClientMailboxIdentity" ADD COLUMN "oauthStateExpiresAt" TIMESTAMP(3);
ALTER TABLE "ClientMailboxIdentity" ADD COLUMN "providerLinkedUserId" TEXT;
ALTER TABLE "ClientMailboxIdentity" ADD COLUMN "connectedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ClientMailboxIdentity_oauthState_key" ON "ClientMailboxIdentity"("oauthState");

CREATE TABLE "MailboxIdentitySecret" (
    "id" TEXT NOT NULL,
    "mailboxIdentityId" TEXT NOT NULL,
    "provider" "MailboxProvider" NOT NULL,
    "encryptedCredential" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxIdentitySecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailboxIdentitySecret_mailboxIdentityId_key" ON "MailboxIdentitySecret"("mailboxIdentityId");

ALTER TABLE "MailboxIdentitySecret" ADD CONSTRAINT "MailboxIdentitySecret_mailboxIdentityId_fkey" FOREIGN KEY ("mailboxIdentityId") REFERENCES "ClientMailboxIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
