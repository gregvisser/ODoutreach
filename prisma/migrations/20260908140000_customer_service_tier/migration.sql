CREATE TYPE "ClientServiceTier" AS ENUM ('MAINTENANCE', 'GROWTH', 'STRATEGIC');

ALTER TABLE "Client"
ADD COLUMN "serviceTier" "ClientServiceTier",
ADD COLUMN "serviceTierSetByStaffUserId" TEXT,
ADD COLUMN "serviceTierSetAt" TIMESTAMP(3),
ADD COLUMN "serviceTierRevision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Client_serviceTierSetByStaffUserId_idx" ON "Client"("serviceTierSetByStaffUserId");
CREATE INDEX "Client_serviceTier_idx" ON "Client"("serviceTier");
ALTER TABLE "Client" ADD CONSTRAINT "Client_serviceTierSetByStaffUserId_fkey"
FOREIGN KEY ("serviceTierSetByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
