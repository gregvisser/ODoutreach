# Cycle 76 - queue row 44, the 429 fix and what it did to error monitoring

## In one sentence a non-coder can check

Production error monitoring is **on** - proven by finding the Sentry address
inside the code Azure is actually serving right now - and the grade record,
which claimed it was on for a reason that stopped being true three weeks ago,
now says the real reason and has a test that fails if anyone breaks it.

---

## The pull request sweep

`gh pr list --state open` returned nothing. Cycles 71-75 cleared the seventeen
Greg counted and the pile has not rebuilt. Two minutes, and the right two.

---

## The four things, written before touching anything

1. **Files.** `.bidlow/GRADES.json`,
   `src/lib/monitoring/sentry-config-wiring.test.ts`, `.bidlow/relay/QUEUE.md`,
   this log.
2. **The red-first test.** `sentry-config-wiring.test.ts`, asserting the deploy
   workflow sets `NEXT_PUBLIC_SENTRY_DSN` as a **literal** on the **build**
   step. Watched red by making exactly the regression it guards against.
3. **Done.** The grade record says something true about error monitoring, and a
   test stops it becoming false again.
4. **Not touched.** The three Sentry config files (correct as they stand),
   `sentry-data-collection.ts`, any send path, any schema.

---

## Half this row was already done, and the row did not know it

**Part (b) is closed and has been since cycle 62.** The row says `dataCollection`
is "now an EMPTY object" with the installer's hints deleted and nothing
replacing them. That was true when the row was written and was fixed by
`47692b9` (#312) two cycles later, which went considerably further than this row
asked: not just `userInfo: false` and `httpBodies: []`, but a shared
`src/lib/monitoring/sentry-data-collection.ts` naming **every** field the SDK
knows about, wired into all three entry points, with two test files behind it.

That fix also found the thing this row missed. The row assumes an empty
`dataCollection` block means "the defaults still apply". It is worse: in
`@sentry/core` 10.67.0 the resolver picks its base with
`options.dataCollection != null ? DEFAULTS : legacyBridge(sendDefaultPii)`, and
an empty object is not null - so **supplying** the block is what selects the
permissive defaults. Deleting it would have been safer than leaving it empty.

I confirmed that fix is not merely merged but **live**, which is a different
claim. The bundle Azure is serving right now contains:

```
dataCollection:{userInfo:!1,cookies:!1,httpHeaders:{request:!1,response:!1},
httpBodies:[],urlQueryParams:!1,...}
```

Observed in `main-app-dd8eeb3ffd7afc58.js` fetched from
`app-opensdoors-outreach-prod.azurewebsites.net`. That is better evidence than
the test, because it is the running system.

---

## Part (a): the answer is no, and the reasoning that got there matters

The row's fear: the DSN moved to `process.env.NEXT_PUBLIC_SENTRY_DSN`, so if
that variable is not set on the App Service, production has been blind since the
deploy. The row could not check and said so, which was the right thing to do.

**It could be checked. The Azure CLI worked without any interactive step** -
`az webapp config appsettings list` returned 38 settings. That correction
belongs in the row: the tool did not refuse.

**There is no Sentry setting on the App Service.** Not misspelled, not empty -
absent. 38 settings, none matching SENTRY.

And monitoring is on anyway. `NEXT_PUBLIC_*` is not a runtime lookup: Next.js
substitutes the value present when `next build` ran and freezes it
(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, lines
164-166). `deploy-production.yml` sets the DSN as a literal on the build step,
so it is baked in before the app ever reaches Azure.

### The part I nearly got wrong

The docs talk about the browser bundle. This product's errors mostly happen on
the **server** - the send pipeline, the database - so "the browser bundle has
it" is not the answer to the question the grade record actually makes.

I built locally with the variable unset and grepped `.next/server`. The
reference `process.env.NEXT_PUBLIC_SENTRY_DSN` was **still there**, live, in the
server chunk and in `edge-instrumentation.js`. Read alone, that looks like proof
that the server depends on a runtime setting that does not exist - i.e. that
server-side monitoring in production is off.

It is not. I rebuilt with a distinctive throwaway DSN set, and:

| | var UNSET | var SET |
|---|---|---|
| literal baked into `.next/server` | no | **yes** (chunk + edge-instrumentation) |
| `process.env` read left in `.next/server` | yes | **none anywhere** |
| literal in browser bundle | no | yes |

```
init({dsn:"https://deadbeef...@o9999999999999999.ingest.de.sentry.io/1234567890",
tracesSampleRate:.1,enableLogs:!0,dataCollection:{userInfo:...
```

The reference survives only when there is no value to substitute. All three
runtimes inline from the build environment. The first measurement was an
artefact of the unset variable, and stopping there would have produced a
confident, wrong, alarming finding.

**Three independent confirmations, then:** no Azure setting exists and none is
needed; the value inlines into server, edge and browser at build time; and the
DSN is present in the JavaScript the production URL is serving.

---

## What I changed

**`.bidlow/GRADES.json`, two entries.** The `met` line said "the Sentry DSN is
hard-coded in `sentry.server.config.ts`". False since `72a11bd` in cycle 52. The
row was right to flag it. The *conclusion* - error monitoring cannot be switched
off by a missing setting - survives, for a different and now-measured reason, so
the line is corrected rather than removed, with the three checks named.

The `not_met` line repeated the same false premise. Corrected, and its real
point sharpened: what is proven is that the DSN **reaches** the deployed code;
what is still unproven is that an event **lands**. Nobody has watched the Sentry
dashboard receive one. That gap is untouched and still the only thing between
this grade and a 9 - I did not close it and have not pretended to.

**A drift guard**, in the existing wiring test. That one literal in
`deploy-production.yml` is now the single point of failure for production
observability, and there are two silent ways to lose it: turn it into
`${{ secrets.X }}` or `${{ vars.X }}` (an unset one expands to an empty string -
no error, no warning, SDK off), or move it off the build step, where it inlines
nothing. Neither shows up in lint, tests, or a green deploy.

Four assertions: the DSN is set on the step that runs the build; its value
contains no `${{`; it matches the shape of a real DSN (shape, not value - pinning
the project id would fail the first time it is rotated); and all three configs
keep the exact literal text Next.js needs in order to substitute it.

**Watched red**, by making the regression rather than describing it:

```
FAIL  sets it as a literal DSN, not an expression that can expand to empty
AssertionError: expected '${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}' not to contain '${{'
```

Workflow restored, green again.

---

## Gates

- `npm run lint` - clean, no output
- `npm run typecheck` - clean
- `npm test` - **314 files, 3133 tests, all passing**
- `npx next build --webpack` - exit 0, twice
- `.bidlow/GRADES.json` re-parsed after editing

One caveat, honestly: the first full run showed `relay/cycle-log-reaches-git.test.ts`
failing on a **5s timeout**, not an assertion. Alone it passes in 1.4s; the
second full run was green. It is a slow `git` call under 15-worker contention on
this machine, and it touches nothing I changed. **I am flagging it rather than
fixing it** - a merge-blocking test that fails on timing is a real problem, but
it is not this row and bumping a timeout without understanding it is how flakes
get buried. Added to the queue as its own row.

No schema change, no migration, nothing sent, no client data touched - none of
the three stop-and-ask conditions applies.

---

## For the next cycle

The remaining Sentry gap is **one look at a dashboard**: has an event actually
arrived? Everything up to the boundary is now proven; arrival is not. Given this
project's habit of building things that report success and never fire, that last
step is worth more than it looks - and it is the only thing standing between the
engineering grade and a 9.

Note the shape of this row, because it is likely to recur: it was written from a
correct reading of a diff, and by the time it was taken, half of it was fixed and
the other half rested on a premise about Next.js that was wrong in a way that
would have produced a false alarm. Both halves needed measuring rather than
reasoning about.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 76 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-28 23:40:44, took about 36.6 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 76 - queue item 44

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE 429 FIX (#299, `72a11bd`) MAY HAVE SWITCHED PRODUCTION ERROR MONITORING OFF, AND IT DELETED THE INSTRUCTIONS FOR THE PII PROBLEM WITHOUT FIXING IT.** Checked 2026-08-28. That commit was right to act - a hardcoded DSN was rate-limiting CI - but it changed two other things by side effect. **(a) The DSN is now `process.env.NEXT_PUBLIC_SENTRY_DSN`.** GRADES.json engineering.met currently credits this project with "Error monitoring cannot be switched off by a missing setting - the Sentry DSN is hard-coded". THAT SENTENCE IS NOW FALSE, and if the variable is not set on the App Service then production has been running blind since the deploy. I could not read the Azure app settings from here (the tool refuses without an interactive consent step), so this is UNVERIFIED - verify it, do not assume either way, and correct the grade line whichever way it lands. **(b) `dataCollection` is now an EMPTY object.** The installer's commented lines - `userInfo: false` and `httpBodies: []` - are gone. They were the only thing on the page telling anyone how to stop prospect names, addresses and email bodies being sent to a third party, and NOTHING replaced them. The defaults still apply, so CR-06 is exactly as open as it was, minus the hint. That is worse than before: a reader now sees a tidy empty object and no reason to look further. Set both explicitly and add a test that asserts the init options, so this cannot drift back. **Lesson worth writing down:** the fix was for CI, and the blast radius was production observability and a live privacy gap. A change to shared config needs its non-CI consequences stated before it merges.

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
  `DONE 76`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 76 - ...** |` reads correctly.
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

* Finished it -> `DONE 76 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 76 - <what is done, what is left>`. PARTIAL
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

Cycle 76 complete. Merged, deployed, verified by hash.

## What the item asked, and what was actually true

**PR sweep:** zero open PRs at start, zero at end. Cycles 71–75 held the line.

**Part (b) was already done** — closed by cycle 62 (`47692b9`), two cycles before this row was picked up. It went further than the row asked: not just `userInfo: false` and `httpBodies: []`, but a shared policy naming *every* field the SDK knows about. That cycle also corrected the row's own reasoning — an empty `dataCollection` block doesn't mean "the defaults still apply"; supplying the block is what *selects* the permissive defaults, because an empty object isn't null.

**Part (a): production was never blind.** Three independent measurements:
- The App Service has **no Sentry setting at all** (38 settings, none matching) — and needs none. Also: the Azure CLI did **not** refuse as the row expected; `az webapp config appsettings list` worked directly.
- `NEXT_PUBLIC_*` is a build-time substitution, and `deploy-production.yml` sets the DSN as a literal on the build step.
- The DSN is in the JavaScript production actually serves — confirmed twice, across two different builds.

**The near-miss worth flagging.** I built with the variable unset and found a live `process.env.NEXT_PUBLIC_SENTRY_DSN` read still sitting in the server chunk and edge instrumentation. Read alone, that looks like proof server-side monitoring is off — and the server is where this product's errors happen. Rebuilding with the value set showed the literal baked into server, edge and browser with no `process.env` read left anywhere. The reference survives only when there's nothing to substitute. Reporting the first measurement would have been confident, alarming and wrong.

## What changed

`.bidlow/GRADES.json` — both entries corrected. The conclusion ("cannot be switched off by a missing setting") survives, for a different and now-measured reason, so I corrected rather than deleted it. The `not_met` line repeated the same false premise; its real point is now sharper: the DSN provably *reaches* the deployed code, but **nobody has watched an event land**. I did not close that gap and haven't pretended to — it remains the only thing between this grade and a 9.

A drift guard in `sentry-config-wiring.test.ts`, watched red by making the regression rather than describing it: `expected '${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}' not to contain '${{'`.

**Gates:** lint 0, typecheck 0, 314 files / 3133 tests green, build exit 0 twice. Deploy run 33219512920 green; `/api/build-info` on the direct App Service URL returns `7ceeae34…`, health ok, database ok.

## Two things I left rather than fixed

A merge-blocking test, `relay/cycle-log-reaches-git.test.ts`, failed once on a **5-second timeout** (not an assertion) — passes alone in 1.4s, and the second full run was green. It's a slow `git` call losing a race with 15 workers, and it touches nothing I changed. Filed as queue row 87 with an explicit note *not* to just raise the timeout, since that buries it. It will eventually red a cycle that did nothing wrong.

Row 44's status is `DONE 76`. Row 87 is `TODO`.

**Open questions: 1.** Has anyone actually seen a Sentry event arrive? Everything up to the boundary is now proven; arrival is not — and on this project, "wired" repeatedly hasn't meant "firing."

