# Reply sync now runs continuously — row 125, cycle 158, 2026-08-30

## Greg's decision, verbatim

"Sending and replying must be within the suggested hours, but receiving
emails should be any time." Made 30 August, after he replied to a prospect on
a Sunday and nothing collected it until a cycle forced the sync by hand.

## The measured facts, before this change

Read from `.github/workflows/`, not assumed:

- `sync-replies.yml`: `*/15 7-18 * * 1-5` — every 15 minutes, 07:00-18:00 UTC,
  weekdays only.
- `process-outbound-queue.yml`: `*/5 7-18 * * 1-5` — every 5 minutes, same
  window.

Both receive-side and send-side were restricted to the same weekday
business-hours window. A reply landing after 18:00 Friday was invisible on
every operator screen — Activity, the reply-needing-a-person queue — until
07:00 Monday: up to 61 hours.

## The damage question, answered before anything was changed

**Question:** can a scheduled follow-up go out to a contact who has already
replied but whose reply has not yet been synced into the database?

**Answer: no, not through the mechanism this row was worried about.** The
worry was that a widely-spaced reply sync (15 minutes, on a separate
schedule) would leave a window in which `process-outbound-queue.yml`
dispatches a follow-up before that reply has been read. Reading the actual
code shows this is not how the send path is protected:

`process-outbound-queue.yml` runs its own reply sync as its first step, in
the same job, immediately before it advances follow-ups:

1. **"Sync replies before advancing"** calls
   `POST /api/internal/replies/sync`, which `await`s
   `syncActiveClientMailboxInboxes` before the HTTP response returns
   (`src/app/api/internal/replies/sync/route.ts:33`). When it matches a
   reply to an outbound email, it writes the `InboundReply`, marks the
   outbound row `REPLIED`, and — still inside the same awaited call —
   `await`s `stopFollowUpsForLinkedReply`
   (`src/server/mailbox/process-synced-replies.ts:294-297`), which sets the
   linked sequence enrolment's status to `COMPLETED`
   (`src/server/email-sequences/stop-follow-ups-on-reply.ts:61-71`). This is
   committed to the database before step 1 finishes.
2. **"Advance due sequence follow-ups"** calls
   `POST /api/internal/sequences/advance` as a separate HTTP request. It
   loads ready step-sends with the enrolment's live status
   (`src/server/email-sequences/send-introduction.ts:436-464`), re-runs the
   send-execution classifier per row
   (`src/lib/email-sequences/sequence-send-execution-policy.ts:375-386`), and
   an enrolment already `COMPLETED` is skipped
   (`src/lib/email-sequences/sequence-send-policy.ts:221-228`). Because this
   is a fresh Prisma query in a separate request, it sees step 1's write.
3. **"Call outbound queue processor"** then sends whatever was actually
   queued by step 2. It does not re-check replies at dispatch time
   (`src/server/email/outbound/execute-one.ts` has no `InboundReply` or
   enrolment lookup) — but by this point step 1 has already run.

So for a linked reply (one that matches an existing outbound email — the
normal case), the real race window is not the ~15-minute gap between two
independent schedules; it is the few seconds to ~2 minutes between step 1
and step 2 *within the same 5-minute `process-outbound-queue.yml` run*, and
that job is unaffected by this row: **`process-outbound-queue.yml` is not
being changed.**

**Two residual gaps exist, found while answering this, and neither is
created or worsened by this row's change:**

- Step 1 caps its scan at `maxMailboxes: 50` per run, ordered oldest-synced
  first (`src/server/mailbox/mailbox-inbox-sync.ts:608-609` /
  `.github/workflows/process-outbound-queue.yml:36`). With roughly 55 live
  mailboxes, a mailbox that misses this cap on a given tick is not covered
  by that run's inline sync — it is covered by the next run that reaches it,
  or by the standalone `sync-replies.yml` schedule. **This is exactly the
  gap this row's change narrows**, by making the standalone schedule run
  every 15 minutes around the clock instead of only inside the same 12-hour
  weekday window `process-outbound-queue.yml` already covers.
- A reply that does not match any existing outbound email (`InboundReply`
  linked to nothing) stops nothing —
  `src/server/mailbox/process-synced-replies.ts:261-263` returns early. This
  is a structural gap unrelated to cron cadence and out of scope for this
  row; it is not made better or worse by changing when the sync runs. Not
  filed as a new row here because it needs its own investigation of how
  often it actually occurs before it is worth a row — noted here so it is
  not lost.

**Conclusion: an unsynced reply does not, in the ordinary case, allow a
follow-up through — `process-outbound-queue.yml`'s own inline pre-advance
sync is the load-bearing guard, and this row does not touch that workflow.**
This is a latency fix for operator visibility (Activity, the reply queue),
not a correctness fix for sending.

## Greg's condition, checked before changing anything

His words: "leave sending and receiving the way it is if it will cause
problems." Checked each named risk:

- **Duplicate inbound rows / double-processing:** the reply sync upserts on
  the compound unique key `(mailboxIdentityId, providerMessageId)`
  (`src/server/mailbox/mailbox-inbox-sync.ts:257-265`,
  `:471-479`). Running the sync more often across the calendar cannot create
  duplicate `InboundReply` rows for the same message — the same guard that
  already protects the existing 15-minute weekday cadence protects the
  extended one identically.
- **Provider rate limits / throttling:** the per-tick call shape (mailboxes
  scanned, messages per mailbox) is unchanged — only the number of days and
  hours the same 15-minute cadence now covers increases. The new runs land
  in hours that were previously idle (nights, weekends), so this spreads
  load rather than concentrating it.
- **Cost, stated rather than hidden:** roughly triples the scheduled runs of
  `sync-replies.yml`, from about 220 a week (15-min cadence × 12 hours ×
  5 days ÷ 15 min ≈ 220) to 672 (15-min cadence × 24 hours × 7 days ÷ 15 min
  = 672). Each run is a lightweight `curl` to an internal endpoint plus a
  short Node job — the realistic downside is a few pennies of GitHub Actions
  compute a week, in line with the supervisor's own estimate in the row.
- **A race with the send queue that gets worse:** `process-outbound-queue.yml`
  is unchanged and still only runs weekday business hours, so it never
  overlaps with the new out-of-hours reply-sync runs at all. During business
  hours the two workflows already ran concurrently today (5-minute inline
  sync + 15-minute standalone sync); that relationship is unchanged by this
  row.

No finding argued against the change. It was made.

## The other schedules, checked while here

Every cron in `.github/workflows/` (`grep -A2 "schedule:" .github/workflows/*.yml`):

| Workflow | Cron | Receive-side? | Verdict |
|---|---|---|---|
| `sync-replies.yml` | was `*/15 7-18 * * 1-5`, now `*/15 * * * *` | Yes | Fixed by this row. |
| `process-outbound-queue.yml` | `*/5 7-18 * * 1-5` | No (send) | Unchanged, correctly business-hours-only — Greg's explicit decision. |
| `alerts.yml` | `0 7 * * *` (daily) | No (the daily digest) | Already unrestricted; its own comment says "reply sync runs daily" — that comment was **wrong** until this row (the reply sync was weekday-only), and is now true. |
| `support-agent.yml` | `0 8-18 * * 1-5` | No — it does not just receive: it triages, edits code, opens PRs and can email a reporter back. That is a send/act workflow wearing a receive-adjacent name, not a pure inbox poll. | Correctly left business-hours-only; out of scope for a row about the reply sync specifically. |
| `mailbox-credential-probe.yml` | `0 6 * * 1` (Monday) | No — a weekly health probe, not inbound mail | Not receive-side in the sense this row means; left alone. |
| `signature-link-audit.yml` | `0 6 * * 1` (Monday) | No | Left alone. |
| `bounce-path-audit.yml` | `30 6 * * 1` (Monday) | No | Left alone. |
| `tracking-dns-sweep.yml` | `30 5 * * *` (daily) | No | Already unrestricted; left alone. |
| `discover-domain-families.yml` | `20 2 * * *` (daily) | No | Already unrestricted; left alone. |

Only `sync-replies.yml` is a pure inbound-mail poll restricted to business
hours; it is the only one this row changes.

## The change

`.github/workflows/sync-replies.yml`: cron changed from `*/15 7-18 * * 1-5`
to `*/15 * * * *`. `.github/workflows/process-outbound-queue.yml`: not
touched.

## Proof it fires

`relay/reply-sync-schedule.test.ts` reads the real workflow YAML files and
simulates whether each cron fires at four sample UTC instants (Sunday night,
Saturday evening, a weekday outside 07:00-18:00, and a weekday inside
07:00-18:00 as a sanity control). It:

- Watched **red** against the un-edited file — `the live sync-replies.yml
  cron fires at night and at the weekend` failed with `expected false to be
  true` at the Sunday-night instant, before the cron string was touched.
- Watched **green** after the one-line cron edit above, all three tests
  passing.
- Separately asserts, against a string literal of the OLD cron (not read
  from disk, so it can never silently start passing again), that the old
  expression would have failed all three night/weekend instants and passed
  the business-hours control — proving the matcher itself is discriminating,
  not vacuously true.
- Asserts `process-outbound-queue.yml`'s cron is still exactly
  `*/5 7-18 * * 1-5` — a regression guard on the "do not touch" instruction.

**Real workflow run outside business hours, quoted after merge:** ⬜ to be
filled in below once observed — see the log for this cycle for the current
status (a real run had not yet been observed at the time this document was
first written, since the cron change had not yet reached `main`).
