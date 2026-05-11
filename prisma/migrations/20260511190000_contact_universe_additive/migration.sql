-- Additive: global Contact Universe warehouse + per-import attribution.
-- Client contacts remain tenant-scoped; optional universeContactId links a row to its warehouse record.

CREATE TYPE "UniverseSourceType" AS ENUM ('CSV_IMPORT', 'ROCKETREACH', 'MANUAL', 'OTHER');

CREATE TABLE "ContactUniverse" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT,
    "linkedinUrlNormalized" TEXT,
    "mobilePhoneNormalized" TEXT,
    "officePhoneNormalized" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "jobTitle" TEXT,
    "companyName" TEXT,
    "location" TEXT,
    "city" TEXT,
    "country" TEXT,
    "sourceSummary" TEXT,
    "firstSeenClientId" TEXT,
    "firstSeenSourceType" "UniverseSourceType" NOT NULL DEFAULT 'OTHER',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weakMatchKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactUniverse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactUniverse_emailNormalized_key" ON "ContactUniverse"("emailNormalized");

CREATE UNIQUE INDEX "ContactUniverse_weakMatchKey_key" ON "ContactUniverse"("weakMatchKey");

CREATE INDEX "ContactUniverse_linkedinUrlNormalized_idx" ON "ContactUniverse"("linkedinUrlNormalized");

CREATE INDEX "ContactUniverse_mobilePhoneNormalized_idx" ON "ContactUniverse"("mobilePhoneNormalized");

CREATE INDEX "ContactUniverse_lastSeenAt_idx" ON "ContactUniverse"("lastSeenAt");

CREATE INDEX "ContactUniverse_firstSeenClientId_idx" ON "ContactUniverse"("firstSeenClientId");

CREATE INDEX "ContactUniverse_companyName_idx" ON "ContactUniverse"("companyName");

CREATE INDEX "ContactUniverse_country_idx" ON "ContactUniverse"("country");

ALTER TABLE "ContactUniverse" ADD CONSTRAINT "ContactUniverse_firstSeenClientId_fkey" FOREIGN KEY ("firstSeenClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ContactUniverseSource" (
    "id" TEXT NOT NULL,
    "universeContactId" TEXT NOT NULL,
    "clientId" TEXT,
    "sourceType" "UniverseSourceType" NOT NULL,
    "sourceLabel" TEXT,
    "importBatchId" TEXT,
    "rocketReachPersonId" TEXT,
    "rawSourceMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactUniverseSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactUniverseSource_universeContactId_idx" ON "ContactUniverseSource"("universeContactId");

CREATE INDEX "ContactUniverseSource_clientId_idx" ON "ContactUniverseSource"("clientId");

CREATE INDEX "ContactUniverseSource_importBatchId_idx" ON "ContactUniverseSource"("importBatchId");

CREATE INDEX "ContactUniverseSource_sourceType_idx" ON "ContactUniverseSource"("sourceType");

ALTER TABLE "ContactUniverseSource" ADD CONSTRAINT "ContactUniverseSource_universeContactId_fkey" FOREIGN KEY ("universeContactId") REFERENCES "ContactUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactUniverseSource" ADD CONSTRAINT "ContactUniverseSource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContactUniverseSource" ADD CONSTRAINT "ContactUniverseSource_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ContactImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contact" ADD COLUMN "universeContactId" TEXT;

CREATE INDEX "Contact_universeContactId_idx" ON "Contact"("universeContactId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_universeContactId_fkey" FOREIGN KEY ("universeContactId") REFERENCES "ContactUniverse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
