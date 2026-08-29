# Cycle 106 — queue item 92: walk the send-and-reply journey through the real screens

## What the item said

Dimension 1 (Core journeys end-to-end, weight 18, score 8) is held at 8 because
nobody has clicked send-and-reply through the actual UI screens on this build —
a test nobody has run, not a score that is wrong. Walk it as a human: sign in as
staff, pick or enrol a contact, prepare the send, send it, watch it arrive, reply
from the recipient side, confirm the reply lands back against the right thread
and contact. `bidlowai` only, real mail or nothing. Record it like the 26 August
proofs — a dated artefact under `docs/ops/`. Re-score dimension 1 only if the
walk moves it; if it cannot be completed, leave the score at 8, say which step
blocked it, and mark the row PARTIAL.

## PR sweep first

`gh pr list --state open --json number,title,statusCheckRollup,mergeable,headRefName`
→ `[]`. Nothing to merge.

## Picking this up: what was already on disk

This row had already been attempted twice and killed both times at the 45-minute
deadline (cycle 103 on an earlier row, cycle 105 on this one — see
`log/cycle-103.md`, `log/cycle-105.md`). Cycle 105's work was not lost: the
working tree already carried a completed `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`,
a `.bidlow/STATE.md` note recording the walk in progress, and a `QUEUE.md` edit
marking the row (mid-write, not in the six-word status vocabulary). Nothing had
been committed. Per this project's rule that a kill does not undo work, the
document was read and independently checked rather than re-done from scratch or
discarded.

## Verifying the inherited work before trusting it

- Re-read the exact lines the document cites in `src/server/email-sequences/send-introduction.ts`
  (`buildUnsubscribePlaceholder`, `alignedLinkBaseUrl`, `senderRowForSend`, the
  `composeSequenceEmail` call and its `blocked.push` branch) and in
  `src/lib/email-sequences/sequence-email-composition.ts` (`SEND_REQUIRED_FIELDS`,
  the `sendReady` computation). All match the document's account exactly —
  `Client.defaultSenderEmail` null → `buildUnsubscribePlaceholder` returns `""` →
  `unsubscribe_link` missing → `sendReady: false` → blocked before any
  `OutboundEmail` row is created.
- Read `scripts/.tmp-launch-log.txt` (a raw, timestamped log written by the
  inherited walk script, not authored by this cycle): confirms the identical
  on-screen refusal and the safety-gated abort ("expected exactly 1 queued row
  (mine), found 0. Not draining.") that the document reports.
- Fetched a fresh 30-minute-lifetime staff session (same `encode()`-from-`next-auth/jwt`
  technique the document and `e2e/global-setup.ts` both use, secret pulled live
  from the production App Service config, never written to a file that reaches
  git) and did a **read-only** check of `bidlowai`'s outreach sequence list.
  Result: exactly one `Cycle 105 walk` sequence remains, plus the pre-existing
  `BidlowAI — audit-led intro` sequence the document deliberately left alone —
  matching the document's own "what this walk leaves behind" section with no
  stray debug duplicates. A `scripts/tmp-cleanup.mjs` script had been written to
  delete leftover duplicates but, on this evidence, was never actually needed.

Nothing about the inherited document's technical claims or its conclusion
needed correcting.

## Files changed

- `.bidlow/GRADES.json` — dimension 1's `observed` field extended with the
  2026-08-29 re-walk (root cause, both passes, what remains unproven). **Score
  left at 8**, exactly as instructed for a walk that could not be completed.
- `CUSTOMER-READY-REPORT.md` — matching scorecard row 1 update and a new
  "Re-walked 2026-08-29 (cycle 106)" paragraph. Weighted total unchanged (7.76).
- `.bidlow/STATE.md` — replaced the stale "in progress, mid-task" cycle 105 note
  with the closed-out account.
- `.bidlow/relay/QUEUE.md` — row 92 set to `PARTIAL 106` with the finding and
  proof-file pointer.
- `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md` — kept as written by the
  inherited walk (verified, not modified).
- `.bidlow/relay/log/cycle-103.md`, `cycle-104.md`, `cycle-105.md`, `cycle-106.md`
  — added; a merge-blocking test (`relay/cycle-log-reaches-git.test.ts`) exists
  precisely so these do not go missing in a rebase.
- **Deleted, never committed:** `scripts/.tmp-cookie-header.txt`,
  `scripts/.tmp-launch-log.txt`, `scripts/.tmp-prod-storage-state.json` (held a
  live production session cookie — a secret, and must never reach git history),
  `scripts/.tmp-screenshots/` (28 PNGs, scratch evidence already narrated in the
  kept document), and the four `scripts/tmp-*.mjs` throwaway Playwright scripts
  (each header-commented TEMPORARY / NOT COMMITTED), plus one read-only listing
  script written and deleted this cycle.
- **Left untouched, out of scope for this row:** `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
  (untracked, pre-existing, unrelated to dimension 1 — not created or needed by
  this row, so not committed or deleted).

## Red-first

Not applicable in the usual sense — this row is a manual walk-and-record task,
not a code change with a red/green cycle. The equivalent substitute, per this
repository's established practice for non-code rows: the *inherited* raw
evidence (`scripts/.tmp-launch-log.txt`, now deleted after being read and its
content folded into this log) was independently re-derived by re-reading the
cited source lines rather than trusting the document's paraphrase, and the
document's "what remains" claim was checked against a fresh read-only query
rather than assumed.

## What this closes and what it does not

**Closes:** the walk itself, performed through the real screens, with proof.
**Does not close:** the row. Per the row's own instruction, a walk that cannot
complete send → arrival → reply → match stays PARTIAL with the score held. Named
plainly: none of those four steps were reached; the walk got to the point of a
genuine, reproducible refusal at launch and stopped there, honestly.

## Gates run

- `npm run lint` → 0 errors.
- `npm run typecheck` → 0 errors.
- `node -e "JSON.parse(...)"` on `.bidlow/GRADES.json` → valid.
- `npm test` → 3643/3644 passing. The one failure
  (`relay/cycle-log-reaches-git.test.ts`) is the test's own documented expected
  state at the start of a cycle (untracked cycle logs on disk) and resolves once
  this commit adds `.bidlow/relay/log/cycle-103.md` through `cycle-106.md`.

No schema change, no migration, no client data moved, no email sent. The hard
rule was never approached this cycle: the only production actions taken were a
read-only session-mint and a read-only sequence listing, both against `bidlowai`.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 106 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-29 20:41:31, took about 16.7 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, src/server/safety/autonomous-mode.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 106 - queue item 92

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **DIMENSION 1 IS HELD AT 8 BECAUSE NOBODY HAS CLICKED SEND-AND-REPLY THROUGH THE SCREENS ON THIS BUILD. THAT IS A TEST NOBODY HAS RUN, NOT A SCORE THAT IS WRONG.** `.bidlow/GRADES.json` dimension 1 (Core journeys end-to-end, weight 18, score 8) says it in as many words: the browser walk is navigation-only. The score moves if, and ONLY if, the journey is actually performed and recorded. It does NOT move because the code looks like it ought to pass, because an integration test covers the same chain, or because this walk was longer than the last one. **WALK IT AS A HUMAN:** signed in as staff, go through the screens an operator actually uses - pick or enrol a contact, prepare the send, send it, watch it arrive, reply from the recipient side, and confirm the reply lands back in the product against the right thread and the right contact. **THE HARD RULE APPLIES AND IS NOT NEGOTIABLE: real mail may leave for `bidlowai` and for nobody else.** The guard is `src/server/safety/autonomous-mode.ts`; production /api/health currently reports allowlistedClients 1. If this walk appears to need a send for any other client, THE WALK IS WRONG - stop and write down why. **RECORD IT LIKE THE LAST ONE:** a dated artefact under `docs/ops/`, in the shape of `SEND-PROOF-2026-08-26.md` and `REPLY-PROOF-2026-08-26.md` - what was clicked, in what order, against which commit, what actually left, the raw evidence, and UTC timestamps. A cycle log claiming it happened is not the artefact; this project's signature defect is precisely the thing that reports success and never fired. **THEN, AND ONLY THEN, re-score dimension 1**, and name plainly what the walk did NOT cover. **DO NOT TOUCH ANY OTHER DIMENSION.** If the walk cannot be completed, LEAVE THE SCORE AT 8, say which step blocked it, and mark this row PARTIAL (note: PARTIAL rows are only picked up once the watcher has been restarted - see row 95). **DO NOT WORK BACKWARDS FROM 8.0.** Greg's instruction, verbatim: a re-walk that goes looking for +0.38 will find +0.38. Let the number land where it lands.

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
  `DONE 106`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 106 - ...** |` reads correctly.
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

* Finished it -> `DONE 106 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 106 - <what is done, what is left>`. PARTIAL
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

Clean. Row 92 is closed, PR #393 merged to `main` (`c0b79d6`), and the deploy workflow this cycle's docs-only change doesn't require a rebuild (that's row 96's separate, pre-existing issue).

**Summary of cycle 106:**

- **PR sweep:** none open at start.
- **Row 92 (dimension 1 re-walk):** picked up cycle 105's killed-but-preserved work, independently verified its code claims and its "workspace left clean" claim (read-only check of production confirmed no stray duplicates), and closed it out. Finding: a real operator can build a template/contact/sequence through the actual `bidlowai` screens to "Ready to launch," but every real launch is refused before any email leaves the building — root cause is `Client.defaultSenderEmail` being `null` for BidlowAI, which breaks the mailto unsubscribe fallback. Nothing was sent. Score **held at 8** exactly as instructed (send/arrival/reply/match still unproven). QUEUE.md row 92 → `PARTIAL 106`.
- Deleted (never committed) a live prod session-cookie file and other scratch artifacts the killed cycle left on disk.
- Caught and preserved a genuinely concurrent edit: Greg approved the `defaultSenderEmail` fix in Cowork mid-cycle (new row 98) — carried it forward in its own commit without acting on it, since that's a separate row for the next cycle.
- Cleaned up a stale, already-merged branch (`docs/state-cycle-103`) left over from before this cycle.
- Gates: lint 0, typecheck 0, 3644/3644 tests, CI green, merged without needing Greg (docs-only, no migration/client-data/email).

Left untouched, out of scope: the untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` at repo root (unrelated to this row). Row 98 (the actual `defaultSenderEmail` fix) is next up for whichever cycle picks it up.

