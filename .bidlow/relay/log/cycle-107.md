# Cycle 107 - queue item 98

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG HAS APPROVED THIS EXPLICITLY. IT TOUCHES REAL CLIENT DATA, THE APPROVAL IS RECORDED HERE, AND YOU DO NOT NEED TO ASK AGAIN.** Asked and answered in Cowork on 29 August 2026: set the `bidlowai` client's `Client.defaultSenderEmail` to `greg@bidlow.co.uk` in PRODUCTION. **WHY:** cycle 105 and cycle 106 both walked the real screens and both were refused at launch with 'Composition lost send-readiness between planning and dispatch; re-plan' - two independent passes, two different recipients, identical refusal, evidence in `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`. Root cause traced in deployed code: BidlowAI has no verified sender-aligned link domain, so `unsubscribeUrlForSend` falls back to `buildUnsubscribePlaceholder(client.defaultSenderEmail)`, which returns empty when that field is null - and BidlowAI's is null - so `composeSequenceEmail` marks `unsubscribe_link` missing and `sendReady` false. **SCOPE, AND DO NOT EXCEED IT:** the `bidlowai` client and no other. The field is currently NULL, so this overwrites nothing - it is additive in effect. Do NOT change any other client, do NOT touch the schema, and do NOT send anything from this row: rows 92 and 97 own the send, this row owns the field. **PROVE IT TOOK, do not report success:** read the value back out of the production database afterwards and quote it in your log, then re-run the composition path for the same sequence and show that `sendReady` is now true and `unsubscribe_link` is populated - the point of this row is that the refusal stops, not that an UPDATE returned a row count. If it is still refused, say so and name the next cause rather than declaring the field set and moving on. **RAISE A NEW ROW, do not fix it here:** there is no operator-facing screen anywhere in the product to set `defaultSenderEmail`, for ANY client. Any client without an aligned link domain hits this identical wall the first time they launch a real sequence, and today the only remedy is a hand-edit by Greg. That is a product gap with a client-facing cost - write it into QUEUE.md as its own row, above the BLOCKED rows so the picker reaches it.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## What it did

**PR sweep at cycle start:** `gh pr list --state open` returned `[]`. Nothing to merge.

**Before touching anything, the four things:**
1. Files: a new `scripts/ops-set-bidlowai-default-sender.ts`, a new
   `.github/workflows/set-bidlowai-default-sender.yml`, and one `package.json`
   script entry. No existing product code touched.
2. Red-first: the composition proof re-run against the CURRENT (unwritten)
   production row, read-only, via `dry_run=true` — this is the red state,
   captured live off production rather than asserted.
3. Done = `Client.defaultSenderEmail` for `bidlowai` reads back as
   `greg@bidlow.co.uk` from a fresh database query, AND re-running the real
   composition path for a real sequence in that workspace shows
   `sendReady: true` with a populated `unsubscribe_link` — checkable by
   reading the workflow run log, no code-reading required.
4. Not touched: every other client's `defaultSenderEmail`; the schema; any
   send path; rows 92/97 (which own the actual send).

**Built the script + workflow, hard-scoped and additive-only** (see
`scripts/ops-set-bidlowai-default-sender.ts` for the full design notes):
hard-coded to `slug = "bidlowai"`, the write is
`updateMany({ where: { slug, defaultSenderEmail: null } })` so it can only
ever move null → the target value, refuses outright if the field is already
set to something else, idempotent on re-run, requires a literal `CONFIRM`
token, writes an `AuditLog` row. Merged via #394 (green CI: lint 0,
typecheck 0, 3644/3644 tests).

**Two real bugs found and fixed running it, both left in the record rather
than silently patched over:**
1. The first version imported `buildSenderRow` / `eligibleWorkspaceMailboxPool`
   from `src/server/...`. Almost every file under `src/server/` starts with
   `import "server-only"`, a Next.js bundler-only bare specifier with no real
   package behind it — the first dry-run dispatch (run 33273151065) died with
   `MODULE_NOT_FOUND` before touching the database. Fixed in #396: reproduced
   the two small pure functions inline (mirrors
   `send-introduction.ts:263-268` and `:270-305` exactly) and switched every
   import to `src/lib/*`, matching what every other `ops-*.ts` script already
   does.
2. The workflow's `dry_run` input is a real GitHub Actions boolean;
   `inputs.dry_run == 'true'` evaluates false always (GH Actions coerces
   cross-type `==` numerically, not string-wise), so `DRY_RUN` was silently
   always empty — the next dispatch (run 33273635212) hit the script's
   CONFIRM-required refusal even with `dry_run=true`. Fixed in #397:
   `${{ inputs.dry_run && '1' || '' }}`.

**Dry-run against production (run 33273956500), the red state, read-only,
off the real row:**
```
[ops-set-bidlowai-default-sender] client=cmpmhb5j40000gbo05h6oyc7j slug=bidlowai name="BidlowAI" defaultSenderEmail(before)=null dryRun=yes
[proof] Re-ran the real dispatch-time composition path against sequence "Cycle 105 walk — 2026-08-29-cycle105" (cmterwbmt000ug0mfh1705kcq), template "Cycle 105 walk intro — 2026-08-29-cycle105" (cmterw6xi000qg0mf4xxbv4rg), contact gr***@gmail.com, mailbox gr***@bidlow.co.uk.
[proof] unsubscribe_link (sender.unsubscribeLink) = null
[proof] composition.sendReady = false
[proof] composition.missingFields = ["unsubscribe_link"]
[proof] FAIL — sendReady is still false.
```
This is the same "Cycle 105 walk" sequence, template and contact left behind
by the actual screen walk in `SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md` —
not a synthetic example.

**The write (run 33274025135), `CONFIRM="SET BIDLOWAI DEFAULT SENDER"`,
`dry_run=false`:**
```
[ops-set-bidlowai-default-sender] client=cmpmhb5j40000gbo05h6oyc7j slug=bidlowai name="BidlowAI" defaultSenderEmail(before)=null dryRun=no
defaultSenderEmail(after, re-read from a fresh query) = greg@bidlow.co.uk
Write confirmed by independent read-back. AuditLog entry recorded.
[proof] Re-ran the real dispatch-time composition path against sequence "Cycle 105 walk — 2026-08-29-cycle105" ..., contact gr***@gmail.com, mailbox gr***@bidlow.co.uk.
[proof] unsubscribe_link (sender.unsubscribeLink) = mailto:greg@bidlow.co.uk?subject=unsubscribe
[proof] composition.ok = true
[proof] composition.sendReady = true
[proof] composition.missingFields = []
[proof] PASS — sendReady is true and unsubscribe_link is populated. The refusal traced in SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md is resolved for this composition input.
```
The value was read back from a **fresh, separate** `prisma.client.findUnique`
call, not trusted off the `updateMany` row count. Exactly one row matched the
scoped `where` clause (asserted in code; the script exits non-zero otherwise),
so no other client was touched. No schema change, no email sent, no
`OutboundEmail` row created — this only re-ran the pure composition function,
the same one `sendSequenceIntroductionBatch` calls, without going through the
dispatch transaction.

**This does not, by itself, prove a real launch will now succeed** — rows 92
and 97 own the actual send/re-walk, per the row's own scope instruction. It
proves the ONE traced cause (`unsubscribe_link` missing because
`defaultSenderEmail` was null) is now cleared for this composition input. If
a fresh launch attempt is still refused, the refusal has moved to a different
cause and that is the next row's finding to make, not this one's to guess at.

**New product-gap row raised: row 99**, positioned immediately after this
row (before rows 92/96/97/93/94/95 and well above the two BLOCKED rows,
84 and 48, which the picker cannot walk past) — there is no operator-facing
screen anywhere in the product to set `Client.defaultSenderEmail` for any
client, and every client without a verified aligned link domain hits this
identical wall the first time they try to launch a real sequence.

Gates: `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors, `npm test`
3644/3644 passed (re-run after each of the three PRs). No schema change, no
other client touched, no email sent.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 107 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (1 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-29 20:59:14, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 107 - queue item 98

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG HAS APPROVED THIS EXPLICITLY. IT TOUCHES REAL CLIENT DATA, THE APPROVAL IS RECORDED HERE, AND YOU DO NOT NEED TO ASK AGAIN.** Asked and answered in Cowork on 29 August 2026: set the `bidlowai` client's `Client.defaultSenderEmail` to `greg@bidlow.co.uk` in PRODUCTION. **WHY:** cycle 105 and cycle 106 both walked the real screens and both were refused at launch with 'Composition lost send-readiness between planning and dispatch; re-plan' - two independent passes, two different recipients, identical refusal, evidence in `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`. Root cause traced in deployed code: BidlowAI has no verified sender-aligned link domain, so `unsubscribeUrlForSend` falls back to `buildUnsubscribePlaceholder(client.defaultSenderEmail)`, which returns empty when that field is null - and BidlowAI's is null - so `composeSequenceEmail` marks `unsubscribe_link` missing and `sendReady` false. **SCOPE, AND DO NOT EXCEED IT:** the `bidlowai` client and no other. The field is currently NULL, so this overwrites nothing - it is additive in effect. Do NOT change any other client, do NOT touch the schema, and do NOT send anything from this row: rows 92 and 97 own the send, this row owns the field. **PROVE IT TOOK, do not report success:** read the value back out of the production database afterwards and quote it in your log, then re-run the composition path for the same sequence and show that `sendReady` is now true and `unsubscribe_link` is populated - the point of this row is that the refusal stops, not that an UPDATE returned a row count. If it is still refused, say so and name the next cause rather than declaring the field set and moving on. **RAISE A NEW ROW, do not fix it here:** there is no operator-facing screen anywhere in the product to set `defaultSenderEmail`, for ANY client. Any client without an aligned link domain hits this identical wall the first time they launch a real sequence, and today the only remedy is a hand-edit by Greg. That is a product gap with a client-facing cost - write it into QUEUE.md as its own row, above the BLOCKED rows so the picker reaches it.

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
  `DONE 107`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 107 - ...** |` reads correctly.
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

* Finished it -> `DONE 107 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 107 - <what is done, what is left>`. PARTIAL
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


