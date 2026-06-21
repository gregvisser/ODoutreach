-- Outreach mailbox signature phone numbers.
-- Additive + nullable only: no existing rows are read or rewritten, and the
-- new columns default to NULL, so this is safe to apply online.
--
--   * Client.signaturePhone               — the client's company landline; the
--                                            default the one-click branded
--                                            signature puts on every mailbox.
--   * ClientMailboxIdentity.senderPhone   — optional per-mailbox override for a
--                                            sender with their own direct line.

ALTER TABLE "Client" ADD COLUMN "signaturePhone" TEXT;
ALTER TABLE "ClientMailboxIdentity" ADD COLUMN "senderPhone" TEXT;
