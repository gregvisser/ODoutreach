# Cycle 114 — queue item 92

## PR sweep at cycle start

`gh pr list --state open` returned one open PR: **#406**
("docs(relay): row 92 - identical redispatch one minute after cycle 112",
branch `docs/state-cycle-113` — this cycle's own branch). `gh pr checks 406`
showed both checks (`E2E (Playwright)`, `verify`) still **pending**, not
green. Per the sweep rule, a PR that is not green is not mine to force —
left it running; it will be picked up by a future PR sweep once its checks
resolve. This cycle's own commits land on the same branch/PR rather than
opening a second one, since branch protection would otherwise force a
needless second round of CI for a docs-only change to the same row.

The untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` in the repo root was
found again, exactly as prior cycles found it (a Claude-Project setup
artefact, not part of the engineering record). Left untouched, out of scope
for this row.

## The item

Row 92: dimension 1 (Core journeys end-to-end) held at 8, pending proof that
a reply lands back in the product matched to the right send. This cycle's
brief text was byte-identical to cycle 113's — same "UPDATE 29 AUGUST 22:51
UTC" addendum, no new instruction. The relay had already marked the row `IN
PROGRESS 114` in `QUEUE.md` on disk (uncommitted) before this cycle's process
started, which is the picker's own bookkeeping, not this cycle's work.

## Before touching anything

1. **Files to change:** none in `src/`. Only `.bidlow/relay/QUEUE.md`, this
   log, and a new file under `docs/ops/`.
2. **Red-first test:** not applicable — this is a docs-only observation row.
   The equivalent discipline applied here was checking the actual elapsed
   time, the cron schedule, and row 95's own status directly, before
   deciding not to re-check anything.
3. **What "done" looks like:** either a genuinely new observation about the
   reply/match state, recorded in `docs/ops/`, with dimension 1 re-scored
   accordingly — or an honest, evidenced explanation of why no new
   observation is possible this cycle, with the score left exactly where it
   was.
4. **What I must not touch:** `.bidlow/GRADES.json` beyond dimension 1 (not
   touched at all this cycle — no change made), any `src/` file, any other
   client's data, any email send, `_standards`, any sibling project folder,
   `relay-watch.ps1`.

## What I checked before deciding not to re-walk

```
GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info
-> {"commit":"4fe9cfa614...","buildTimestamp":"2026-08-29T23:21:42Z"}
GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/health
-> {"ok":true,"checks":{"database":"ok"},
    "autonomousRelay":{"active":true,"allowlistedClients":1}}
date -u -> 2026-08-29 23:31:37 UTC   (= 2026-08-30 00:31:37 UK)
```

`allowlistedClients` stayed at 1 (`bidlowai` only) — the hard rule's own
visible proof, checked rather than assumed. Cycle 113's own log records it
finishing at approximately 00:29 UK (started 00:21:58, ran ~7.4 minutes) —
about **two minutes** before this cycle started. The reply-sync cron
(`.github/workflows/sync-replies.yml`) only runs weekdays 07:00–18:00 UK;
this is Sunday ~00:31 UK, over 30 hours from Monday's window. Row 95's status
in `QUEUE.md` is still `TODO` — confirmed directly, not assumed — so its
"watcher restart changes PARTIAL-pickup behaviour" mechanism has not taken
effect, which is consistent with this row being redispatched again only two
minutes after the previous cycle closed it. No cron ran, no new brief text,
no new instruction from Greg, no indication of any human action on the
send/reply chain since cycle 113 wrote its log.

## What I did instead of re-walking

Nothing that mutates or re-observes state that could not have changed in two
minutes: no session was minted, no screens were loaded, the reply-sync
endpoint was not re-triggered, and the production database was not
re-queried. Cycles 111–113 already did the database-level and screen-level
checks this row needs. Repeating either now would produce the appearance of
diligence with none of the substance — the same failure mode ("reports
success and never fired," inverted: manufacturing a check that cannot show
anything new) this row's own instructions warn against.

Wrote `docs/ops/REPLY-PROOF-2026-08-29-cycle114.md`, recording this
reasoning, the time-math evidence, and a strengthened version of cycles
112–113's un-acted-on recommendation to the relay: this is now the fifth
consecutive cycle (110, 111, 112, 113, 114) on identical brief text, and the
gap between redispatches is shrinking (same night → ~1 minute → ~2 minutes)
rather than widening, which is the opposite of what row 95's fix should
produce once the watcher is actually restarted. Did not touch
`relay-watch.ps1`, row 95's own row text, or anything under `_standards` —
fixing the redispatch cadence is row 95's job, and not something this row's
own text authorizes.

## Re-score dimension 1

**Held at 8.** No new evidence exists to move it, and none was manufactured
to look like there was. `.bidlow/GRADES.json` was not edited this cycle.

## Gates

No `src/` change, so no lint/typecheck/test run was needed or performed —
confirmed by `git diff --stat` before commit: only `.bidlow/relay/QUEUE.md`,
`.bidlow/relay/log/cycle-113.md` (the watcher's own addendum from the prior
cycle, carried forward uncommitted, not this cycle's work product),
`.bidlow/relay/log/cycle-114.md`, and one new file under `docs/ops/`.

## What this does not cover

The chain send → arrival → reply → correct-thread-match remains unproven for
the specific send this row needs proven. That is unchanged from cycle 113 —
this cycle added no new coverage and claims none.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 114 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 00:30:23, took about 4 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, src/server/safety/autonomous-mode.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 114 - queue item 92

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
  `DONE 114`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 114 - ...** |` reads correctly.
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

* Finished it -> `DONE 114 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 114 - <what is done, what is left>`. PARTIAL
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

I'll wait for the background CI watch (or the scheduled check-in) to tell me when PR #406's checks resolve, then merge it.

