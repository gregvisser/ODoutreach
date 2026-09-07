CREATE TYPE "CompanyDncReviewOutcome" AS ENUM ('ALLOW', 'BLOCK');

CREATE TABLE "CompanyDncEntry" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyDncEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyDncEntry_name_check" CHECK (length("canonicalName") BETWEEN 1 AND 300 AND length("originalName") BETWEEN 1 AND 300)
);
CREATE UNIQUE INDEX "CompanyDncEntry_clientId_canonicalName_key" ON "CompanyDncEntry"("clientId", "canonicalName");
CREATE UNIQUE INDEX "CompanyDncEntry_id_clientId_key" ON "CompanyDncEntry"("id", "clientId");
ALTER TABLE "CompanyDncEntry" ADD CONSTRAINT "CompanyDncEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompanyDncDecision" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "companyKey" TEXT NOT NULL,
  "ruleVersion" INTEGER NOT NULL,
  "outcome" "CompanyDncReviewOutcome" NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyDncDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyDncDecision_company_check" CHECK (length("companyKey") BETWEEN 1 AND 300)
);
CREATE UNIQUE INDEX "CompanyDncDecision_clientId_entryId_companyKey_ruleVersion_key" ON "CompanyDncDecision"("clientId", "entryId", "companyKey", "ruleVersion");
ALTER TABLE "CompanyDncDecision" ADD CONSTRAINT "CompanyDncDecision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyDncDecision" ADD CONSTRAINT "CompanyDncDecision_entryId_clientId_fkey" FOREIGN KEY ("entryId", "clientId") REFERENCES "CompanyDncEntry"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;
