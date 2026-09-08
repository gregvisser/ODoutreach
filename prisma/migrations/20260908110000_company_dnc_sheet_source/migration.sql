CREATE TABLE "CompanyDncSheetSource" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "spreadsheetId" TEXT NOT NULL,
  "tabName" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "knownNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "currentNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastAttemptAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastError" TEXT,
  "retainedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyDncSheetSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyDncSheetSource_counts_check" CHECK ("revision" >= 0 AND "retainedCount" >= 0)
);
CREATE UNIQUE INDEX "CompanyDncSheetSource_clientId_key" ON "CompanyDncSheetSource"("clientId");
ALTER TABLE "CompanyDncSheetSource" ADD CONSTRAINT "CompanyDncSheetSource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
