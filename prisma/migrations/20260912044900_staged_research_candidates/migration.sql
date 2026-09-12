CREATE TABLE "ProspectResearchCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE REFERENCES "ProspectResearchRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "providerProfileId" TEXT NOT NULL,
  "email" TEXT,
  "company" TEXT,
  "evidence" JSONB NOT NULL,
  "decision" JSONB NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
