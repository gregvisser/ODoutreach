ALTER TABLE "InboundMailboxMessage" ADD COLUMN "supersededByMessageId" TEXT;
CREATE INDEX "InboundMailboxMessage_supersededByMessageId_idx" ON "InboundMailboxMessage"("supersededByMessageId");
ALTER TABLE "InboundMailboxMessage" ADD CONSTRAINT "InboundMailboxMessage_supersededByMessageId_fkey"
  FOREIGN KEY ("supersededByMessageId") REFERENCES "InboundMailboxMessage"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "InboundMailboxMessage" ADD CONSTRAINT "InboundMailboxMessage_not_self_superseded"
  CHECK ("supersededByMessageId" IS DISTINCT FROM id);

-- Ordinary ingestion may refresh the canonical row, but never an archived original
-- or the identity that connects it to its retained aliases. The reviewed installer
-- alone sets a null mapping; it also proves pristine/equivalent/zero-reference state.
CREATE FUNCTION protect_inbound_supersession() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target "InboundMailboxMessage"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."supersededByMessageId" IS NOT NULL
      OR EXISTS (SELECT 1 FROM "InboundMailboxMessage" WHERE "supersededByMessageId" = OLD.id) THEN
      RAISE EXCEPTION 'Retained inbound identities cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."supersededByMessageId" IS NOT NULL THEN
      RAISE EXCEPTION 'Inbound supersession must be installed on retained originals' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."supersededByMessageId" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Superseded inbound originals are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."supersededByMessageId" IS DISTINCT FROM OLD."supersededByMessageId" THEN
    PERFORM pg_advisory_xact_lock(hashtext('odoutreach.inbound-supersession'), 0);
    SELECT * INTO target FROM "InboundMailboxMessage" WHERE id = NEW."supersededByMessageId" FOR UPDATE;
    IF NOT FOUND OR target."supersededByMessageId" IS NOT NULL
      OR EXISTS (SELECT 1 FROM "InboundMailboxMessage" WHERE "supersededByMessageId" = NEW.id)
      OR target."clientId" <> NEW."clientId" OR target."mailboxIdentityId" <> NEW."mailboxIdentityId"
      OR target."ingestionSource" <> 'MICROSOFT_GRAPH' OR NEW."ingestionSource" <> 'MICROSOFT_GRAPH'
      OR target."fromEmail" <> NEW."fromEmail" OR target."receivedAt" <> NEW."receivedAt"
      OR nullif(NEW.metadata->>'internetMessageId','') IS NULL
      OR target.metadata->>'internetMessageId' IS DISTINCT FROM NEW.metadata->>'internetMessageId'
      OR (to_jsonb(NEW) - 'supersededByMessageId') IS DISTINCT FROM (to_jsonb(OLD) - 'supersededByMessageId') THEN
      RAISE EXCEPTION 'Invalid inbound supersession' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM "InboundMailboxMessage" WHERE "supersededByMessageId" = OLD.id)
    AND (NEW.id IS DISTINCT FROM OLD.id OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
      OR NEW."mailboxIdentityId" IS DISTINCT FROM OLD."mailboxIdentityId"
      OR NEW."providerMessageId" IS DISTINCT FROM OLD."providerMessageId"
      OR NEW."ingestionSource" IS DISTINCT FROM OLD."ingestionSource"
      OR NEW."fromEmail" IS DISTINCT FROM OLD."fromEmail" OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
      OR NEW.metadata->>'internetMessageId' IS DISTINCT FROM OLD.metadata->>'internetMessageId') THEN
    RAISE EXCEPTION 'Canonical inbound identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_inbound_supersession BEFORE INSERT OR UPDATE OR DELETE ON "InboundMailboxMessage"
FOR EACH ROW EXECUTE FUNCTION protect_inbound_supersession();
