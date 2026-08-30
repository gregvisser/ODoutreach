# Cycle 141 - queue item 113

## PR sweep (start of cycle)

`gh pr list --state open` returned nothing - no open PRs to merge or comment on.

## Housekeeping found in passing

`git status` at the start of the cycle showed `.bidlow/relay/log/cycle-140.md`
untracked - the previous cycle wrote it but never committed it. Running the
full gate (`npm test`) turned this into a real red: `relay/cycle-log-reaches-git.test.ts`
failed with the log file listed as reaching git but not present in the index.
That test exists specifically to catch this class of miss, so it is fixed here
by staging `cycle-140.md` alongside this cycle's own change, not treated as
out of scope. Re-ran the single test file after staging: green (6/6).

`ODOUTREACH-PROJECT-INSTRUCTIONS.md` at the repo root is also untracked but is
not named by this row and is not a relay log, so it was left untouched.

## The four things, written down before touching anything

1. **Files to change:** `.bidlow/relay/QUEUE.md` only (row 113's status cell,
   moved to the back of the table per the standing "a BLOCKED row goes to the
   back" rule) plus this log and the stray `cycle-140.md` log.
2. **Red-first test:** none applies. This row is a reconnaissance-and-report
   row with an explicit early exit ("if the key is absent, close it BLOCKED
   and change nothing") - there is no code behaviour to drive red before
   green. The one thing that DID go red unexpectedly was the pre-existing
   `relay/cycle-log-reaches-git.test.ts` failure described above, and it is
   now green.
3. **Done looks like:** row 113 tells a human, in one sentence, whether
   ANTHROPIC_API_KEY exists on the production App Service yet, without ever
   printing what it is - and if it does not exist yet, nothing else in the
   row was attempted.
4. **Not touched:** no application code, no `docs/ops/` artefact (the
   Definition of Done in the row only applies once the key exists), no
   `.bidlow/GRADES.json`, CR-10 left open, no send, `bidlowai` sequence
   counters untouched, nothing under `_standards` or any sibling client
   folder.

## What the row asked

Prove the six AI features fire in production, and prove the one that carries
a prospect's own reply text (`classify-inbound-reply.ts`) is still refused
even with a real key present. First step, mandatory and non-negotiable per
the row: check whether `ANTHROPIC_API_KEY` exists on the production App
Service by NAME ONLY, never reading a value, and stop there if it is absent.

## What I found

Confirmed the target first: `az account show` → subscription `Azure
subscription 1`; `az webapp show --name app-opensdoors-outreach-prod
--resource-group rg-opensdoors-outreach-prod` → state `Running`, default
hostname `app-opensdoors-outreach-prod.azurewebsites.net` - the correct
production App Service, matching CLAUDE.md.

```
az webapp config appsettings list --name app-opensdoors-outreach-prod \
  --resource-group rg-opensdoors-outreach-prod --query "[].name" -o tsv
```

returned 38 setting names (AUTH_*, DATABASE_URL, MAILBOX_*,
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, BOUNCE_SUPPRESSION_ENABLED,
AUTONOMOUS_SEND_ALLOWLIST, and so on). `ANTHROPIC_API_KEY` is **not** in that
list. No value was read, printed, logged, or written for any setting -
only names, and only that one name is discussed here.

## What this means

The key is absent, so per the row's own instruction this row cannot be
completed this cycle. Nothing was set, guessed, stubbed, or marked done.
Neither the five-safe-feature proof nor the classify-inbound-reply
refusal check was attempted, because both require a key that does not
exist yet - attempting either without it would just reproduce today's
"AI is not configured" message and prove nothing new. CR-10 was not
touched and stays open on both halves. No `docs/ops/` artefact was written,
because the Definition of Done in the row is explicitly gated on the key
being present.

## Status

Row 113 moved to `BLOCKED 141` and to the back of the queue table (it now
sits directly after row 48, the other long-standing BLOCKED-on-a-human row),
per the standing rule that a row blocked on a human decision goes to the back
so it cannot stall the rows behind it. The row resumes the moment Greg adds
`ANTHROPIC_API_KEY` to the production App Service - at that point the next
cycle should run the five safe features live for `bidlowai`, quote their
output and recorded AI spend, and confirm on the deployed build that
`classify-inbound-reply.ts` is still refused, writing the `docs/ops/`
artefact this row describes.

## Gates run

* `npm run lint` - clean, no errors.
* `npm run typecheck` (`tsc --noEmit`) - clean, no errors.
* `npm test` - first run: 1 failed / 3735 passed, the `cycle-140.md`-not-in-git
  regression described above. After staging `cycle-140.md`: 3736/3736 passed,
  354/354 test files.

No code was changed, so no new tests were required or added; the only
files touched are `.bidlow/relay/QUEUE.md` (row 113's status) and this cycle's
own log plus the previous cycle's untracked log.
