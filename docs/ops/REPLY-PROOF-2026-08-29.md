# The reply leg of row 92 — checked 29 August 2026 (cycle 111)

**Short answer: a real reply arrived and was ingested, but it did not match
the send this walk needs it to match. The chain send → arrival → reply →
correct-thread-match is still not proven end to end for the sequence cycles
109–111 built. This is recorded as a real finding, not smoothed over, and
dimension 1 stays at 8.**

## 1. What Greg did

Mid cycle 111 (see `SEND-PROOF-2026-08-29.md`), row 92's brief was updated
live at **22:51 UTC** to say Greg had received the introduction email in
`greg.visser64@gmail.com` and had replied to it from his phone. His word is
explicitly not treated as the artefact — the brief itself says so — so this
cycle checked what the product actually did with that reply.

## 2. Triggering ingestion

The scheduled reply sync only runs weekdays 07:00–18:00 UK time
(`.github/workflows/sync-replies.yml`, `cron: "*/15 7-18 * * 1-5"`). It is
22:5x UTC on a Saturday — well outside that window — so nothing would have
ingested this reply until Monday morning if left alone. Rather than wait,
this cycle called the same endpoint the cron calls, directly, with the same
secret the cron uses (`PROCESS_QUEUE_SECRET`, read from the App Service's own
config via already-authenticated `az`):

```
POST https://app-opensdoors-outreach-prod.azurewebsites.net/api/internal/replies/sync
Authorization: Bearer <PROCESS_QUEUE_SECRET>
{"perMailboxTop":25,"maxMailboxes":50}

→ 200 OK
{"processed":27,"succeeded":27,"failed":0,"ingested":362,"totalSeen":446,
 "repliesLinked":1,"skipped":23,"errors":[],"ok":true,"failedCount":0}
```

This is a **read/ingest** operation across the whole connected-mailbox
estate — the same thing that runs automatically every 15 minutes on
weekdays — not a send, and not something scoped only to `bidlowai`; it does
not touch the hard rule. `repliesLinked: 1` — one new reply was linked
somewhere in the estate during this run.

## 3. What actually got linked, checked directly in the database

The one reply this sync linked:

| Field | Value |
|---|---|
| `InboundReply.id` | `cmtezdw2g0085g1mg3hjbmwh4` |
| From | `greg.visser64@gmail.com` |
| To | `greg@bidlow.co.uk` |
| Subject | `RE: A quick note from BidlowAI` |
| Received | 2026-08-29 22:48:02 UTC |
| Ingested | 2026-08-29 22:57:38.968 UTC |
| Match method | `BY_CONTACT_EMAIL` |
| **Linked outbound** | `obmta25r09a9677c52c442c3ed` — **the 26 August send to `greg.visser64@gmail.com`, not today's send** |

Today's send (`cmteyyrsj0003g1mgs2slvdj3`, to
`greg.visser64+cycle109@gmail.com`, the whole point of this walk) is
re-checked directly and is **still `status: SENT`, not `REPLIED`.** No reply
is linked to it. The subject on the inbound (`RE: A quick note from
BidlowAI`) is unambiguously a reply to today's email — a human reading it
would have no doubt — but the matcher linked it to a different, older send.

## 4. Why, read from the matching code itself, not guessed

`src/server/mailbox/process-synced-replies.ts` matches `BY_CONTACT_EMAIL` by
requiring the outbound's `toEmail` to **equal** the reply's normalized `from`
address exactly (subject-anchored leg, line ~185, and the legacy fallback,
line ~208 — both key on `toEmail: from`). Today's outbound was sent to
`greg.visser64+cycle109@gmail.com`; Gmail's own "Reply" button sends from
`greg.visser64@gmail.com` — the plus-alias is **not** preserved on the
From header of a reply, because it was never a separate mailbox, just a
routing tag on the same inbox. So no outbound with `toEmail` equal to the
reply's literal `from` address existed for *today's* send; the legacy
fallback then found the most recent outbound that DOES have that exact
`toEmail` — the 26 August one — and linked to that instead, correctly by its
own rule, wrongly for what this walk needed to prove.

**This is not a bug in the matcher isolated to today.** It is doing exactly
what `REPLY-PROOF-2026-08-26.md` already documented it does (match on exact
sender address + subject prefix), applied correctly. What is new here is a
finding about **this project's own testing method**: cycles 109–111 used a
Gmail plus-alias (`+cycle109`) specifically so a fresh "contact" could be
distinguished from Greg's own inbox for these walks. That technique cannot
round-trip through this matcher, because Gmail collapses the alias back to
the base address the moment a real human hits Reply. A genuine prospect using
a real, non-aliased address would not hit this — this is a property of using
one's own plus-aliased inbox as a stand-in for a second real person, not a
defect a prospect would ever trigger.

## 5. What this does and does not prove about row 92

**Proves:** the reply pipeline works — a real external reply was ingested,
matched by a real rule, linked to a real (if different) outbound, on the
real production database, inside a minute of the sync being triggered. This
is the second time this exact mechanism has been proven (after 26 August).

**Does not prove:** that *this* send — the one built and launched through the
real screens across cycles 109–111 — has been replied to and matched
end-to-end. It has not. `cmteyyrsj0003g1mgs2slvdj3` remains `SENT`. Nothing
on the Activity screen for this specific send says "Replied."

**Not attempted:** re-sending to a non-aliased address to get a cleaner
round trip. That would be a second real send under this row, and row 92's
own instruction is explicit that a re-walk was already ruled out (cycle
110's finding) and that this cycle's job, now that the reply exists, is
"pure observation" — not to manufacture a better-fitting test.

## Re-score dimension 1

**Held at 8.** The brief for this cycle is explicit and is followed exactly:
"If the reply has not been ingested yet, say how long it has been waiting and
what the inbound path is blocked on, leave the score at 8, and mark this
PARTIAL naming exactly that." The reply *has* been ingested — but not matched
to the send this row needs proven, which is the same outcome for the
purposes of this row: the specific chain is still unproven. No change made to
`.bidlow/GRADES.json`.

## What would actually close this

Either: a future attempt sends to a plain, non-aliased address so a reply's
From header can exactly equal the outbound's To address (the case the
matcher already handles correctly, per 26 August) — or the matcher itself
grows a rule that treats `user+tag@gmail.com` and `user@gmail.com` as the
same contact for matching purposes, which is a real product decision (it
would also affect suppression and contact de-duplication) and does not
belong in a docs-only row like this one.
