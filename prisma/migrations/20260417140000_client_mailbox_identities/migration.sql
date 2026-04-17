-- CreateEnum
CREATE TYPE "MailboxProvider" AS ENUM ('MICROSOFT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "MailboxConnectionStatus" AS ENUM ('DRAFT', 'PENDING_CONNECTION', 'CONNECTED', 'CONNECTION_ERROR', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "ClientMailboxIdentity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" "MailboxProvider" NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "connectionStatus" "MailboxConnectionStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canSend" BOOLEAN NOT NULL DEFAULT true,
    "canReceive" BOOLEAN NOT NULL DEFAULT true,
    "dailySendCap" INTEGER NOT NULL DEFAULT 30,
    "isSendingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailsSentToday" INTEGER NOT NULL DEFAULT 0,
    "dailyWindowResetAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMailboxIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientMailboxIdentity_clientId_emailNormalized_key" ON "ClientMailboxIdentity"("clientId", "emailNormalized");

-- CreateIndex
CREATE INDEX "ClientMailboxIdentity_clientId_isActive_idx" ON "ClientMailboxIdentity"("clientId", "isActive");

-- CreateIndex
CREATE INDEX "ClientMailboxIdentity_createdByStaffUserId_idx" ON "ClientMailboxIdentity"("createdByStaffUserId");

-- AddForeignKey
ALTER TABLE "ClientMailboxIdentity" ADD CONSTRAINT "ClientMailboxIdentity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMailboxIdentity" ADD CONSTRAINT "ClientMailboxIdentity_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
