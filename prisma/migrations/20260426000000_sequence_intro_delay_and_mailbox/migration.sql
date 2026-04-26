-- Additive: intro/follow-up delay in hours and optional launch mailbox for sequences.

ALTER TABLE "ClientEmailSequenceStep" ADD COLUMN "delayHours" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ClientEmailSequence" ADD COLUMN "launchPreferredMailboxId" TEXT;

ALTER TABLE "ClientEmailSequence"
  ADD CONSTRAINT "ClientEmailSequence_launchPreferredMailboxId_fkey"
  FOREIGN KEY ("launchPreferredMailboxId")
  REFERENCES "ClientMailboxIdentity"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "ClientEmailSequence_launchPreferredMailboxId_idx"
  ON "ClientEmailSequence"("launchPreferredMailboxId");
