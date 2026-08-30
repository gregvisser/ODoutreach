# Cycle 160 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: B9E192203DEB
  On disk now:      3118106EFA98

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 19:59:44, took about 31.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/server/ai/ai-feature-data-policy.ts, bidlow/GRADES.json, docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 160 - queue item 129

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **RE-VERIFY THE AI FEATURES NOW THAT A NEW, WORKSPACE-SCOPED KEY IS IN PRODUCTION. THIS IS THE HIGHEST-VALUE ROW IN THE QUEUE AND IT IS SMALL.** Greg replaced `ANTHROPIC_API_KEY` on `app-opensdoors-outreach-prod` at about 18:48 UTC on 30 August with a key created inside a NEW workspace named `ODoutreach` (`wrkspc_01Nd6QgCKXdPbyFHV4regqTJ`). A key created inside a workspace is scoped to it and does NOT require the `anthropic-workspace-id` header, which is what row 126 exists to add for the unscoped case. **WHAT IS AND IS NOT ALREADY PROVEN, and do not repeat the supervisor's near-miss:** the only check run so far was `az webapp config appsettings list --query "[?name=='ANTHROPIC_API_KEY'].name"`, which printed the NAME. That name was already present before the change, so **it proves the setting exists and proves nothing about which key is in it.** The old key was also present under that same name. **The only real proof is a call that succeeds.** **THE WORK:** (1) Confirm the app has actually restarted and picked up the new value - a settings change restarts the App Service, so check the deployed instance is up before concluding anything from a failure. (2) Re-run **review-campaign** and **draft-sequence** through the real screens for `bidlowai` - those are the two that reached `api.anthropic.com` last time and returned HTTP 400. Quote what the operator sees. (3) Read the production log for the outcome, exactly as cycle 157 did (`az webapp log download`, read, delete, never commit). **If the 400 is gone and a real completion came back, say so and quote the recorded AI spend - that is real money now being spent.** If a 400 or any other error persists, quote it verbatim; if it is still the `anthropic-workspace-id` message then the new key is not workspace-scoped after all and row 126's header work becomes the required fix rather than a nice-to-have. (4) The other three features refused earlier for a legitimate reason - `bidlowai` has too little history - so they may well refuse again. That is the evidence gate working, not a defect. Do not treat a legitimate refusal as a failure, and do not manufacture data to get past it. **AND CONFIRM THE GATE AGAIN, because the key changed and this is the assertion that matters most:** `classify-inbound-reply` / `REPLY_CLASSIFICATION` carries a prospect's own reply text - subject plus up to 2000 characters of body, verbatim - to a vendor with no Art.28 DPA. Confirm on the DEPLOYED build that it is still REFUSED by the row 101 gate (`src/server/ai/ai-feature-data-policy.ts`, #420) and quote the refusal. **If it is NOT refused, that is a live data-protection incident: say so in the first line of your log, stop, change nothing else.** **NEVER print, log, echo or write the key value.** Read setting NAMES only - the settings-list call returns VALUES, so use a `--query` that returns names. The workspace id above is NOT a secret and may be recorded. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate, and do not edit `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`. **NO SEND.** **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** a dated artefact under `docs/ops/` saying plainly whether the AI features now work, quoting what came back and the recorded spend, with the gate refusal quoted verbatim, no secret value anywhere, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 160`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 160 - ...** |` reads correctly.
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

* Finished it -> `DONE 160 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 160 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` continuity note is merged as `2652b3c` on `origin/main`, alongside the row 129 work merged earlier as `7daa9a4`. Both are confirmed live on `origin/main`. Row 129 is closed out: the workspace-scoped Anthropic key works, evidence and continuity notes are recorded, and nothing is left uncommitted.

