-- CreateEnum
CREATE TYPE "StaffGuestInvitationState" AS ENUM ('NONE', 'PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "guestInvitationState" "StaffGuestInvitationState" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "invitationLastSentAt" TIMESTAMP(3),
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "graphInvitationId" TEXT,
ADD COLUMN     "graphInvitedUserObjectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_graphInvitationId_key" ON "StaffUser"("graphInvitationId");

-- CreateIndex
CREATE INDEX "StaffUser_invitedById_idx" ON "StaffUser"("invitedById");

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
