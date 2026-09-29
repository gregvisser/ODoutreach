-- Rewrite pacing / capacity hold copy on READY rows so staff no longer see
-- "launch again". Does not change status, does not queue mail, and does not
-- touch suppression, do-not-contact, unsubscribe, bounce, pause, or a
-- disconnected mailbox. Idempotent: rows already rewritten contain
-- "sends automatically" and are excluded.

UPDATE "ClientEmailSequenceStepSend"
SET
  "blockedReason" = CASE
    WHEN "blockedReason" ILIKE '%gets its share%'
      OR "blockedReason" ILIKE '%another sequence%'
      OR "blockedReason" ILIKE '%shared capacity%'
      THEN 'Queued — sends automatically as this mailbox''s shared capacity frees up.'
    WHEN "blockedReason" ILIKE '%sending calendar%'
      OR "blockedReason" ILIKE '%sending window%'
      THEN 'Queued — sends automatically when this client''s sending window is open.'
    WHEN "blockedReason" ILIKE '%at-a-time release%'
      THEN 'Queued — sends automatically when the next at-a-time release opens.'
    WHEN "blockedReason" ILIKE '%next sending day%'
      THEN 'Queued — sends automatically on the next sending day as mailbox capacity frees up.'
    ELSE 'Queued — sends automatically as mailbox capacity frees up.'
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE status = 'READY'
  AND "outboundEmailId" IS NULL
  AND "blockedReason" IS NOT NULL
  AND "blockedReason" NOT ILIKE '%sends automatically%'
  AND "blockedReason" NOT ILIKE '%suppress%'
  AND "blockedReason" NOT ILIKE '%do not contact%'
  AND "blockedReason" NOT ILIKE '%do-not-contact%'
  AND "blockedReason" NOT ILIKE '%unsubscribe%'
  AND "blockedReason" NOT ILIKE '%bounce%'
  AND "blockedReason" NOT ILIKE '%paused%'
  AND "blockedReason" NOT ILIKE '%disconnect%'
  AND "blockedReason" NOT ILIKE '%unhealthy%'
  AND "blockedReason" NOT ILIKE '%reply-stop%'
  AND (
    "blockedReason" ILIKE '%send pacing%'
    OR "blockedReason" ILIKE '%sending calendar%'
    OR "blockedReason" ILIKE '%mailbox capacity%'
    OR "blockedReason" ILIKE '%at-a-time release%'
    OR "blockedReason" ILIKE '%gets its share%'
    OR "blockedReason" ILIKE '%will not send on its own%'
    OR "blockedReason" ILIKE '%launch this sequence again%'
  );
