-- AlterTable
ALTER TABLE "InboundReply" ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "handledByStaffUserId" TEXT;

-- CreateIndex
CREATE INDEX "InboundReply_handledByStaffUserId_idx" ON "InboundReply"("handledByStaffUserId");

-- AddForeignKey
ALTER TABLE "InboundReply" ADD CONSTRAINT "InboundReply_handledByStaffUserId_fkey" FOREIGN KEY ("handledByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
