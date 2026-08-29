# Cycle 111 — queue item 92

## PR sweep at cycle start

`gh pr list --state open` returned exactly one PR: #403
(`docs(relay): row 92 re-checked - no new attempt, live re-verification
only`), on branch `docs/state-cycle-110`. Checks were green (`verify` and
`E2E (Playwright)`, both `SUCCESS`). Merged with `gh pr merge 403 --squash`
— no conflicts, branch protection satisfied. Started a fresh branch,
`docs/state-cycle-111`, off the updated `origin/main`, carrying forward two
pieces of legitimate uncommitted state already sitting in the working tree at
session start (not this cycle's own work product): the relay watcher's own
addendum to `cycle-110.md`, and a stale `IN PROGRESS 111` marker on row 92
from the relay's own dispatch — both real facts about this project's history.

The untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` in the repo root was found
again, exactly as prior cycles found it. Left untouched — a Claude-Project
setup artefact, not part of the engineering record, out of scope for this row.

## The item

Row 92: dimension 1 (Core journeys end-to-end) held at 8 because nobody has
proved send → arrival → reply → correct-match through the real screens. This
cycle's brief carried something the last several did not: Cowork approval,
recorded 29 August, for the SEND leg specifically, for `bidlowai` only.

## Before touching anything

1. **Files to change:** none in `src/` — an operational walk against
   production plus documentation (`docs/ops/*.md`, `.bidlow/relay/QUEUE.md`,
   this log). `.bidlow/GRADES.json` explicitly NOT to be touched this cycle
   (the brief states the score holds at 8 regardless of the send's outcome).
2. **Red-first test:** not applicable — a walk, not a code change.
3. **Done looks like:** the send leg proven with a dated artefact under
   `docs/ops/`, and the row marked PARTIAL naming the reply-and-match leg as
   the remainder — unless the reply also completes and matches correctly, in
   which case dimension 1 re-scores.
4. **Must not touch:** any other GRADES.json dimension; any client other than
   `bidlowai`; the database schema; `_standards` or any sibling project
   folder; must not click Launch a second time under any circumstance.

## What was found and done

Recon hit a real, unrelated obstacle first: `npm install` of *any* package —
including zero-dependency ones — fails deterministically inside this App
Service's Kudu container this session, with `Tracker "idealTree" already
exists`. Not a stale-cache issue (reproduced after `npm cache clean --force`
and in three separate directories). Worked around by writing a
dependency-free Postgres client (TLS + SCRAM-SHA-256 via Node's own
`net`/`tls`/`crypto`, per RFC 5802) and running it through the same Kudu
command API prior cycles used for `pg`-based recon. Also found along the way:
Kudu's `/api/command` does not go through a shell (no `&&`/`|`/quoting) —
every multi-step command had to be wrapped as `sh -c "..."` explicitly.

Recon then found something that changed the shape of this cycle entirely:
**Greg had already clicked Launch himself**, for real, at 2026-08-29
22:45:54 UTC — verified from `OutboundEmail.staffUserId` resolving to his own
`greg@bidlow.co.uk` super-admin account, not a machine actor and not this
session. This landed while this session was still fighting the npm problem
above, before any staff session had been minted. So this cycle's actual work
became verifying and documenting a send it did not perform, rather than
performing one — recorded exactly that way, not smoothed into a first-person
claim. Full account: `docs/ops/SEND-PROOF-2026-08-29.md`.

Mid-cycle, row 92's own text was updated live (22:51 UTC) to say Greg had
replied for real. This cycle triggered the same `/api/internal/replies/sync`
endpoint the 15-minute weekday cron calls (outside its own window right now)
rather than wait until Monday, and it linked one new reply — but to the 26
August send, not today's, because Gmail's Reply button drops the
`+cycle109` plus-alias this walk's contact depends on for matching. Read
directly from `process-synced-replies.ts` to confirm why, not guessed. Full
account: `docs/ops/REPLY-PROOF-2026-08-29.md`.

One more finding, recorded not fixed, out of scope for this docs-only row: a
prior cycle's session-minting script wrote the literal string
`cycle110-readonly-check` into `StaffUser.entraObjectId` for
`greg@opensdoors.co.uk` in production, rather than a real Microsoft object
id. The schema's own comment says first-login matches by email and
re-attaches the real id, so this should self-heal — but it is a real write to
a real staff record that happened outside any migration, and it's written
down rather than left for someone else to trip over.

## Gates

No code changed this cycle (documentation + two live, mostly read-only
production checks — one write was triggering the reply-sync endpoint, which
is the product's own normal ingest path, not a code change), so
`npm run lint` / `npm run typecheck` / `npm test` are unaffected; not re-run
for a docs-only diff, consistent with prior docs-only cycles in this log.

## Result

`.bidlow/GRADES.json` dimension 1: **score held at 8**, exactly as
instructed — the reply exists but did not match the right send, which the
brief treats the same as not-yet-ingested. `.bidlow/relay/QUEUE.md` row 92 →
`PARTIAL 111`. No schema change, no migration, no other client's data
touched, and no second send attempted. Two dated artefacts:
`docs/ops/SEND-PROOF-2026-08-29.md`, `docs/ops/REPLY-PROOF-2026-08-29.md`.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 111 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-29 23:36:16, took about 29.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, src/server/safety/autonomous-mode.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 111 - queue item 92

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **DIMENSION 1 IS HELD AT 8 BECAUSE NOBODY HAS CLICKED SEND-AND-REPLY THROUGH THE SCREENS ON THIS BUILD. THAT IS A TEST NOBODY HAS RUN, NOT A SCORE THAT IS WRONG.** `.bidlow/GRADES.json` dimension 1 (Core journeys end-to-end, weight 18, score 8) says it in as many words: the browser walk is navigation-only. The score moves if, and ONLY if, the journey is actually performed and recorded. It does NOT move because the code looks like it ought to pass, because an integration test covers the same chain, or because this walk was longer than the last one. **WALK IT AS A HUMAN:** signed in as staff, go through the screens an operator actually uses - pick or enrol a contact, prepare the send, send it, watch it arrive, reply from the recipient side, and confirm the reply lands back in the product against the right thread and the right contact. **THE HARD RULE APPLIES AND IS NOT NEGOTIABLE: real mail may leave for `bidlowai` and for nobody else.** The guard is `src/server/safety/autonomous-mode.ts`; production /api/health currently reports allowlistedClients 1. If this walk appears to need a send for any other client, THE WALK IS WRONG - stop and write down why. **RECORD IT LIKE THE LAST ONE:** a dated artefact under `docs/ops/`, in the shape of `SEND-PROOF-2026-08-26.md` and `REPLY-PROOF-2026-08-26.md` - what was clicked, in what order, against which commit, what actually left, the raw evidence, and UTC timestamps. A cycle log claiming it happened is not the artefact; this project's signature defect is precisely the thing that reports success and never fired. **THEN, AND ONLY THEN, re-score dimension 1**, and name plainly what the walk did NOT cover. **DO NOT TOUCH ANY OTHER DIMENSION.** If the walk cannot be completed, LEAVE THE SCORE AT 8, say which step blocked it, and mark this row PARTIAL (note: PARTIAL rows are only picked up once the watcher has been restarted - see row 95). **DO NOT WORK BACKWARDS FROM 8.0.** Greg's instruction, verbatim: a re-walk that goes looking for +0.38 will find +0.38. Let the number land where it lands. **APPROVAL ALREADY GIVEN - RECORDED HERE ON 29 AUGUST SO NO FURTHER CYCLE STOPS TO SEEK IT.** In Cowork on 29 August the owner was asked, in these words, whether row 92's real-send instruction should be allowed to run or be stopped. He answered: Let it run. That approval covers the SEND leg of this walk, for `bidlowai` and for no other client, and it stands. Do not stop again to seek it and do not re-raise it. Cycle 109 was right to hesitate, but only because this row did not yet carry the approval. **WHAT THIS CLEARS AND WHAT IT DOES NOT:** the send may now be performed and proven. The REPLY leg cannot be performed here at all - a genuine external reply has to be typed by a person at the receiving inbox (greg.visser64@gmail.com), and this workspace holds no second mailbox able to author one. So once the send and its arrival are proven and recorded in a dated artefact under `docs/ops/`, mark this row PARTIAL naming the reply-and-match leg as the remainder, and STOP. **DO NOT RE-WALK IT AGAIN:** cycle 110 established that re-running an identical build against unchanged code produces no new information and litters the workspace with throwaway contacts. Dimension 1 stays at 8 until the reply is matched - reaching Ready to launch, or sending alone, does not move it.

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
  `DONE 111`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 111 - ...** |` reads correctly.
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

* Finished it -> `DONE 111 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 111 - <what is done, what is left>`. PARTIAL
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

STATE.md is updated and pushed to PR #404's branch. I'll continue waiting for CI on that background watch to merge once green.

