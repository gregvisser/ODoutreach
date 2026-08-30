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


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 141 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: B9E192203DEB - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 10:50:47, took about 12 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/server/ai/ai-feature-data-policy.ts, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 141 - queue item 113

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **PROVE THE AI FEATURES ACTUALLY FIRE IN PRODUCTION - AND PROVE THE ONE THAT CARRIES PROSPECT TEXT IS STILL REFUSED.** Greg has decided the Anthropic API is going ahead. Six AI features shipped 28-29 August and every operator screen currently reads 'The AI is not configured on this environment yet... Ask an administrator to add the API key.' **THIS ROW DOES NOT SET THE KEY AND MUST NOT TRY.** Setting a production secret is the owner's action, not the relay's. Do NOT add, print, log, echo or write `ANTHROPIC_API_KEY` anywhere - not in a workflow, not in a test fixture, not in `.env.example` beyond what already exists. **FIRST, CHECK WHETHER THE KEY IS PRESENT** - `az webapp config appsettings list` against the production App Service, reading only the NAMES of the settings, never a value. If `ANTHROPIC_API_KEY` is absent, this row cannot be completed: close it BLOCKED, say plainly that the key has not been set yet and that the work resumes the moment it is, and change nothing. Do not guess, do not stub, do not mark it done. **IF THE KEY IS PRESENT, prove two things and both matter:** (1) THE FIVE SAFE FEATURES WORK. Run each of review-campaign, draft-sequence, advise-send-times, advise-title-messages and explain-rep-performance through the real screens for `bidlowai` and quote what came back. A feature that returns an error, an empty result, or a message the operator cannot act on is NOT working - say so. Note the AI spend each one records, because that is a real cost the owner is now carrying. (2) **THE GATE STILL HOLDS.** `classify-inbound-reply.ts` sends a prospect's own reply text - subject plus up to 2,000 characters of body, verbatim - to Anthropic, and no Art.28 DPA covers that vendor. Row 101 built a fail-closed processor gate for exactly this (`src/server/ai/ai-feature-data-policy.ts`, merged as #420). With the key now present, confirm on the DEPLOYED build that this feature is still REFUSED, and quote the refusal. **This is the most important assertion in the row**: until the key existed the feature was inert by accident; now it must be inert by design, and that is the difference between a gate and a coincidence. If it is NOT refused, that is a live data-protection incident - stop everything, say so at the top of your log, and change nothing else. **DO NOT decide the vendor question.** Whether to pursue an Art.28 DPA with Anthropic is a commercial decision recorded as the other half of CR-10 and it stays open. Do NOT close CR-10. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. No send. The `bidlowai` sequence at Ready: 1, Sent: 0 stays untouched. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** a dated artefact under `docs/ops/` naming each of the six features and what it actually did, with the refusal of the personal-data feature quoted verbatim from the deployed build, the recorded AI spend, and no secret value anywhere in the artefact, the log, or the diff.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

`gh pr list --state open` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and `.bidlow` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* `gh pr merge --auto` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## THIS PROJECT'S FOLDER, AND NOTHING OUTSIDE IT

You are working on ONE client system. Greg runs several side by side, and they
share one folder deliberately: `C:\Bidlowprojects\_standards` is the METHOD -
the hooks, the gates, the skills, the deck, the checklists - and it applies to
every project at once.

**Do not create, edit, move or delete anything under `_standards` unless the
queue row you are working on names that path explicitly.** A change made there
while doing client work does not stay with this client; it silently changes how
every other build is judged, including ones nobody is looking at today. If this
row's work seems to need a change to the method, STOP and write the case for it
into your log as a finding. Somebody will queue it as its own row, against the
standard, where it can be reviewed on its own terms.

The same goes for any sibling project folder - `BidlowClients\Kepak`,
`BidlowClients\Papaya`, `BidlowTools\*`. Read them if a row asks you to
compare something. Never write to them.

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, or one of
  the three named below - stop and write down the question instead. Note what
  changed on 2026-08-27: "an irreversible one-way door" used to sit in this list
  and was read as covering any production merge. It does not. Only (a), (b) and
  (c) below stop you now.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* **MERGING IS YOURS NOW. Greg decided this on 2026-08-27 and asked to stop being
  the bottleneck.** With green CI, MERGE AND DEPLOY WITHOUT ASKING. Do not park a
  finished, green PR and wait for him - a PR left open ROTS: #231 went from clean
  to 36 commits behind and CONFLICTING in a single day, and cost a whole cycle to
  rescue. Leaving it open is not the safe option, it is the expensive one.
* Three things still stop and ask, and they are the ONLY three:
  (a) a DESTRUCTIVE migration - anything that drops or alters an EXISTING table,
      column or type, or backfills over existing rows. Creating a NEW table, a new
      enum, or adding foreign keys to a new table is ADDITIVE and is yours to merge.
      The test is: does dropping what this adds restore today's behaviour exactly?
  (b) anything that touches or moves real CLIENT data.
  (c) anything that causes an EMAIL TO BE SENT. That one is absolute and it is on
      top of the hard rule about `bidlowai`, not instead of it.
  If it is none of those three, you do not need him. Merge it.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 141`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 141 - ...** |` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as `PARTLY DONE 59`. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. `SUPERSEDED` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> `DONE 141 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 141 - <what is done, what is left>`. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> `TODO - <why>`
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

CI is running in the background for PR #441 (the row 113 BLOCKED status update). I'll merge it automatically once it goes green — no action needed from you in the meantime.

