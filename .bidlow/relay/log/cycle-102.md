# Cycle 102 - row 90 (CR-01b)

## PR sweep at cycle start

`gh pr list --state open` returned `[]` - nothing to merge. But `chore/bounce-audit-send-range`
was pushed to origin (3 commits: #385, #386, and an un-PR'd send-range follow-up,
`88d69f0`) with no open PR - opened one (#388), watched CI green (E2E + verify,
~5.5 min), squash-merged and deleted the branch. That put the audit script's
real min/max `sentAt` reporting on `main` before running it against production.

## What this row asked

CR-01b: has a real bounce ever moved `OutboundEmail.status` to `BOUNCED` in
production since the fix (cycle 39, PR #279, merged 2026-08-27)? Read-only only
- rule (c) forbids causing a send. `scripts/ops-bounce-path-audit.ts` already
existed (built cycle 39-ish, refined by #385/#386/88d69f0) but had never actually
been run against production and reported on.

Cycle 101 attempted this and was killed at the 45-minute deadline with an empty
"What it did" section - but it had already triggered two workflow runs
(33257014566 at 14:13 UTC, 33256556664 at 14:02 UTC) before dying. Read both
back rather than re-running blind.

## What was found, read-only throughout

1. **Triggered the audit a third time** (`gh workflow run bounce-path-audit.yml`,
   run 33257443587) after merging #388, to get a result against the exact
   `main` this cycle would report against. Identical to the two prior runs.

2. **11 `OutboundEmail` rows carry `status=BOUNCED`**, all channel=mailbox NDR,
   zero via the ESP webhook. Every row's `updatedAt` is 2026-08-28T19:06:xx -
   after the fix merged (2026-08-27) - which is the only fact that attributes
   the write to the fixed code, since the rows' own `bouncedAt` event times
   (2026-07-01 to 07-03) predate the fix by weeks. These are historical NDRs
   sitting in `opensdoors.co.uk` mailboxes that `record-bounce.ts`, running live
   with the flag on, picked up and stamped for the first time. The probe's own
   verdict line: `OBSERVED`.

3. **`MAILBOX_BOUNCE_DETECTION_ENABLED=true`** confirmed directly in the
   production App Service config (`az webapp config appsettings list --name
   app-opensdoors-outreach-prod --resource-group rg-opensdoors-outreach-prod`),
   not assumed from the code's default.

4. **The row's own premise was wrong, and the probe now says so plainly:**
   "nothing has sent since 3 July" is false. Real send range: 2026-05-20T12:24:54Z
   to 2026-08-26T13:07:09Z, 1,361 sends ever, 0 new since the fix merged. This is
   exactly why #388 (the send-range reporting commit) mattered - without it the
   probe could not have corrected this on its own.

5. **Resend ESP webhook checked separately**, since the row named it explicitly:
   `POST https://app-opensdoors-outreach-prod.azurewebsites.net/api/webhooks/resend`
   returns HTTP 503 - the route is deployed and reachable, and 503 is exactly its
   own "not configured" guard firing. Confirmed via `az webapp config appsettings
   list` that neither `RESEND_WEBHOOK_SECRET` nor `RESEND_API_KEY` exists in
   production. **This is not counted as a second inert path.**
   `src/server/email/providers/index.ts` documents Resend as serving only
   `OutboundEmail` rows WITHOUT a `mailboxIdentityId` - legacy/tests. Real client
   outreach exclusively uses Graph/Gmail via `sendViaConnectedMailboxOrFail`, so
   the mailbox NDR channel is the actual production bounce path for real client
   mail, and that is the one just proven firing.

## Verdict: bounces recorded - CR-01b CLOSED

Of the three outcomes the row named, this is the first: bounces recorded, close
with the evidence.

## What changed

- `.bidlow/GRADES.json`: CR-01b blocker `OPEN` -> `CLOSED` with the evidence
  above. Dimension 9 (Reliability & operability) 7 -> 8 (weight 6). Arithmetic
  and `weighted_total` 7.50 -> 7.56. `movement_this_regrade` and `sell_gate.note`
  both updated to say CR-08 is now the only open blocker and the distance to 8
  is 0.44.
- `CUSTOMER-READY-REPORT.md` updated to match: header score, re-grade narrative,
  scorecard row 9, weighted-total line, top-blockers list (CR-01b struck
  through), fix-to-ready checklist item 6 marked done.
- `.bidlow/relay/QUEUE.md` row 90: `IN PROGRESS 102` -> `DONE 102` with the
  proof.
- No application code touched. No schema, no migration, no client data moved,
  no email sent - every observation used sends and NDRs that had already
  happened before this cycle started.

## Gates

- `npm run lint` -> 0 errors.
- `npm run typecheck` -> 0 errors.
- `npm test` -> 3644 tests green, including `src/lib/grade-record.test.ts`
  (16/16) re-run against the edited `GRADES.json` to prove the schema still
  parses it and the sell-gate result still matches what the scores imply.

## Left alone, deliberately

- CR-08 (raw correlation cuid, dimension 3) - not this row, not touched.
- The wording question of whether a 0%-with-real-data bounce rate should render
  differently from a 0%-with-no-data one - noted in the report, not decided
  here; it's a product-copy call, not a defect this probe can settle.
