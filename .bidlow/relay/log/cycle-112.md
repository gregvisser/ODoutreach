# Cycle 112 — queue item 92

## PR sweep at cycle start

`gh pr list --state open` returned exactly one PR: #404 (`docs(relay): row 92
- send proven live by Greg, reply ingested but mismatched`), the PR cycle 111
opened. Checks were pending when first checked; re-checked a few minutes later
— both `E2E (Playwright)` and `verify` `pass`. Merged with
`gh pr merge 404 --squash` — no conflicts, branch protection satisfied. No
open PRs remained afterward. Rebuilt this cycle's branch (`docs/state-cycle-112`)
off the updated `origin/main`, carrying forward the two pieces of legitimate
uncommitted state already sitting in the working tree at session start (not
this cycle's own work product): the relay watcher's own addendum to
`cycle-111.md`, and the `IN PROGRESS 112` dispatch marker on row 92.

The untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` in the repo root was found
again, exactly as prior cycles found it. Left untouched — a Claude-Project
setup artefact, not part of the engineering record, out of scope for this row.

## The item

Row 92 again: dimension 1 (Core journeys end-to-end) held at 8. The brief text
redispatched to this cycle is byte-for-byte identical to cycle 111's — the
relay's PARTIAL-row redispatch, not a new instruction from Greg.

## Before touching anything

1. **Files to change:** none in `src/` — a read-only screen check plus
   documentation (`docs/ops/REPLY-PROOF-2026-08-29-cycle112.md`,
   `.bidlow/relay/QUEUE.md`, this log). `.bidlow/GRADES.json` explicitly NOT
   touched — held at 8, matching cycle 111's finding.
2. **Red-first test:** not applicable — an operational read-only walk, not a
   code change.
3. **Done looks like:** either new information about the reply-match state, or
   an honest statement that none exists this cycle and why, backed by a fresh
   check against the real screens rather than an assumption — recorded in a
   dated artefact.
4. **Must not touch:** any other GRADES.json dimension; any client other than
   `bidlowai`; the database schema; a second send; `_standards` or any sibling
   project folder.

## What was found and done

Recon first: is there anything actually new to observe, or is this an
identical-brief redispatch with nothing to add? Checked the two facts that
would matter — has any time passed in which the weekday reply-sync cron could
have run (no: still Saturday night UK time, cron is `*/15 7-18 * * 1-5`), and
has the underlying database state cycle 111 documented had any reason to
change since (no: no new send, no new cron run, nothing else touches
`InboundReply`/`OutboundEmail` linkage outside that sync). Concluded, before
doing anything expensive, that a full re-walk (cycle 110's precedent) or a
second manual sync trigger (which cycle 111 already used once, off-window,
for exactly this reply) would reproduce the identical already-known result.

What this cycle added instead: cycle 111's finding was proved by direct
database query (Kudu + a hand-rolled Postgres client, because `npm install`
was broken in that container). Row 92's own instruction asks for something
stronger — that the reply is "visible on the screens an operator actually
uses" — which had not actually been checked yet. This cycle minted a
read-only `next-auth` session for `greg@opensdoors.co.uk` (same technique as
cycles 106/109/110/111) and loaded, without clicking anything, the Cycle 109
sequence's own detail page and the client Activity page. Both confirm cycle
111's finding independently: the sequence shows recipient **PENDING**, Sent:
1, no "Replied" state; the Activity page's Replies panel shows the one
relevant reply, timestamped consistently with cycle 111's DB read, filed
against the 26 August send rather than today's — even though the reply's own
quoted body shows it was actually sent in reply to
`greg.visser64+cycle109@gmail.com`. Full account:
`docs/ops/REPLY-PROOF-2026-08-29-cycle112.md`.

No new reply arrived. No second send was made. No sync endpoint was
re-triggered.

## Gates

No code changed this cycle (documentation + read-only production screen
checks — no writes, no mutating clicks), so `npm run lint` /
`npm run typecheck` / `npm test` are unaffected; not re-run for a docs-only
diff, consistent with prior docs-only cycles in this log.

## Result

`.bidlow/GRADES.json` dimension 1: **score held at 8** — the mismatch cycle
111 found in the database is now also confirmed on the real operator screens,
which strengthens rather than changes the finding. `.bidlow/relay/QUEUE.md`
row 92 → `PARTIAL 112`. No schema change, no migration, no other client's data
touched, no second send. One dated artefact:
`docs/ops/REPLY-PROOF-2026-08-29-cycle112.md`.

A finding recorded but not acted on: this row cannot make further progress
until either Monday's weekday cron window opens, or a future attempt sends to
a plain, non-aliased address. Continuing to redispatch it every cycle between
now and Monday will keep reproducing this same near-zero-information result.
That is a relay/queue-management observation, not something this row's own
text authorizes fixing — written down for whoever next touches the watcher.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 112 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 00:06:33, took about 14.4 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, src/server/safety/autonomous-mode.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 112 - queue item 92

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **DIMENSION 1 IS HELD AT 8 BECAUSE NOBODY HAS CLICKED SEND-AND-REPLY THROUGH THE SCREENS ON THIS BUILD. THAT IS A TEST NOBODY HAS RUN, NOT A SCORE THAT IS WRONG.** `.bidlow/GRADES.json` dimension 1 (Core journeys end-to-end, weight 18, score 8) says it in as many words: the browser walk is navigation-only. The score moves if, and ONLY if, the journey is actually performed and recorded. It does NOT move because the code looks like it ought to pass, because an integration test covers the same chain, or because this walk was longer than the last one. **WALK IT AS A HUMAN:** signed in as staff, go through the screens an operator actually uses - pick or enrol a contact, prepare the send, send it, watch it arrive, reply from the recipient side, and confirm the reply lands back in the product against the right thread and the right contact. **THE HARD RULE APPLIES AND IS NOT NEGOTIABLE: real mail may leave for `bidlowai` and for nobody else.** The guard is `src/server/safety/autonomous-mode.ts`; production /api/health currently reports allowlistedClients 1. If this walk appears to need a send for any other client, THE WALK IS WRONG - stop and write down why. **RECORD IT LIKE THE LAST ONE:** a dated artefact under `docs/ops/`, in the shape of `SEND-PROOF-2026-08-26.md` and `REPLY-PROOF-2026-08-26.md` - what was clicked, in what order, against which commit, what actually left, the raw evidence, and UTC timestamps. A cycle log claiming it happened is not the artefact; this project's signature defect is precisely the thing that reports success and never fired. **THEN, AND ONLY THEN, re-score dimension 1**, and name plainly what the walk did NOT cover. **DO NOT TOUCH ANY OTHER DIMENSION.** If the walk cannot be completed, LEAVE THE SCORE AT 8, say which step blocked it, and mark this row PARTIAL (note: PARTIAL rows are only picked up once the watcher has been restarted - see row 95). **DO NOT WORK BACKWARDS FROM 8.0.** Greg's instruction, verbatim: a re-walk that goes looking for +0.38 will find +0.38. Let the number land where it lands. **APPROVAL ALREADY GIVEN - RECORDED HERE ON 29 AUGUST SO NO FURTHER CYCLE STOPS TO SEEK IT.** In Cowork on 29 August the owner was asked, in these words, whether row 92's real-send instruction should be allowed to run or be stopped. He answered: Let it run. That approval covers the SEND leg of this walk, for `bidlowai` and for no other client, and it stands. Do not stop again to seek it and do not re-raise it. Cycle 109 was right to hesitate, but only because this row did not yet carry the approval. **WHAT THIS CLEARS AND WHAT IT DOES NOT:** the send may now be performed and proven. The REPLY leg cannot be performed here at all - a genuine external reply has to be typed by a person at the receiving inbox (greg.visser64@gmail.com), and this workspace holds no second mailbox able to author one. So once the send and its arrival are proven and recorded in a dated artefact under `docs/ops/`, mark this row PARTIAL naming the reply-and-match leg as the remainder, and STOP. **DO NOT RE-WALK IT AGAIN:** cycle 110 established that re-running an identical build against unchanged code produces no new information and litters the workspace with throwaway contacts. Dimension 1 stays at 8 until the reply is matched - reaching Ready to launch, or sending alone, does not move it. **UPDATE 29 AUGUST 22:51 UTC - THE REPLY NOW EXISTS, SO THE LAST LINK IS AVAILABLE TO PROVE.** The owner confirms he received the outreach email in greg.visser64@gmail.com and has REPLIED to it. The human half of the reply leg is therefore done and no longer blocks this row. What remains is pure observation: prove the reply came back INTO the product, was matched to the right thread and the right contact, and is visible on the screens an operator actually uses. Do it read-only wherever possible, record it in a dated artefact under `docs/ops/` alongside the send evidence, and only then re-score dimension 1. **HIS WORD IS NOT THE ARTEFACT.** It confirms the reply was SENT; the product ingesting it and matching it correctly is the thing this row has to observe for itself. If the reply has not been ingested yet, say how long it has been waiting and what the inbound path is blocked on, leave the score at 8, and mark this PARTIAL naming exactly that - do not mark it proven on the strength of the owner saying he replied.

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
  `DONE 112`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 112 - ...** |` reads correctly.
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

* Finished it -> `DONE 112 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 112 - <what is done, what is left>`. PARTIAL
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

Merged. Row 92 is closed out for this cycle. Summary:

**Cycle 112 — row 92: `PARTIAL 112`**

- PR sweep: merged #404 (cycle 111's own docs PR) at cycle start, then opened and merged #405 for this cycle's own work. No open PRs remain.
- The row's brief was an identical redispatch of cycle 111's — no new time had elapsed for the weekday-only reply-sync cron to run, so a full re-walk or another manual sync trigger would have reproduced already-known results (per cycle 110's precedent for this exact situation).
- Instead did something genuinely new: confirmed cycle 111's database-level finding independently on the **real operator screens** (read-only staff session, no mutating clicks) — the sequence detail shows the recipient still `PENDING`/`Sent: 1` with no "Replied" state, and the Activity page's Replies panel still files the one relevant reply against the wrong (26 August) send, even though the reply's own quoted text shows it was replying to today's send.
- No new reply arrived, no second send was made, `.bidlow/GRADES.json` dimension 1 stays at **8**. Artifact: `docs/ops/REPLY-PROOF-2026-08-29-cycle112.md`.
- Recorded a finding (not acted on): this row can't progress further until Monday's weekday cron window or a fresh non-aliased-address send — redispatching it every cycle until then just reproduces near-zero new information.

