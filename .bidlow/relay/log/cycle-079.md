# Cycle 79 — queue row 38: cycle logs, git, and the precondition that stopped being checked

## Sweep first

`gh pr list --state open` found **one** PR: **#347** (`docs/cycle-078-row-37`,
cycle 78's record of row 37), sitting at `BLOCKED` with both checks
`IN_PROGRESS`. Not red — just not finished yet. Left it running, did the
reconnaissance, came back: `verify` **pass 5m11s**, `E2E (Playwright)`
**pass 5m38s** (run `33222410969`). Merged it — squash **`348f839`**.

That merge matters to this row rather than being incidental housekeeping: #347
was carrying `cycle-077.md` and `cycle-078.md`, so until it landed, two cycle
logs existed only on a branch. **Zero PRs open at the end of this cycle.**

## The row was stale by about a day

Row 38 describes `.gitignore:107` as ignoring `/.bidlow/relay/log/`. It does not.
**Cycle 53 already resolved this**, in PR **#300** (`fix/cycle-logs-reach-git`),
squash **`d7989be`**, merged **2026-08-28 06:11:44Z**.

The decision it recorded, for the record, since the row asked for WHICH and WHY:

* **Chosen: TRACK the logs.** Not "enforce QUEUE.md as the only durable channel".
* **The ignore rule was narrowed, not deleted:** `/.bidlow/relay/log/*` plus
  `!/.bidlow/relay/log/*.md`. Only the markdown record is kept; anything else
  dropped in that folder is scratch and stays ignored. The point of the narrowing
  is that the fix for a red test becomes *"commit the log"* and can never be
  *"add another ignore rule"*.
* **Why not a glob over `.bidlow/**`:** it would sweep in every
  `QUEUE.md.bak-before-*` the relay drops. Same reasoning
  `tracked-artefacts.test.ts` already gives.
* **Guard:** `relay/cycle-log-reaches-git.test.ts`.

## The row's real demand: proved to FIRE, not proved to exist

So I measured it rather than reading the test and believing it. For every log
from `cycle-054.md` to `cycle-078.md`, which commit **added** it:

**25 consecutive logs, every one committed by a LATER cycle, never by its own.**

| log | added by |
|---|---|
| cycle-054 | `d7989be` (#300) — the fix itself |
| cycle-063 | `3d7fef6` (#313) |
| cycle-071 | `a0439a9` (#331) |
| cycle-076 | `7ceeae3` (#344) |
| cycle-077, cycle-078 | `53e49d1`, merged this cycle as `348f839` |

The mechanism is that the newest log is **deliberately not exempt**. The watcher
writes cycle N's log after that agent has exited, so nothing inside cycle N can
commit it; `npm test` is a mandatory gate, so cycle N+1 opens with a RED test
naming cycle N's log. Exempting the newest would have made the test unable to
fire at all. That is a guard with 25 receipts.

## The three measurements, re-run at 77 logs (cycle 53 measured 55)

* **(a) Credential-shaped strings: ZERO**, across all 77 logs, over 12 distinct
  shape patterns. Before trusting that, I proved the scan *can* match — three
  planted credentials, three hits. A clean result from a scanner that cannot
  match anything is exactly this repo's signature defect.
* **(c) Volume: 688,239 bytes**, ~8.9 KB per log. Still negligible. The ~2×
  growth since cycle 53 is longer logs, not more of them.
* **(b) Findings never mirrored into QUEUE.md: not re-derived.** It existed to
  choose between the cheap and the expensive fix; that choice is made and
  shipped. The genuine residual — tracking a log does not make anyone *read* it —
  is held open on purpose as **row 40**, and folding it in here would be quietly
  calling it fixed.

## What was actually wrong, and what this cycle built

Precondition (a) of this row — *scan before tracking, because the object store is
irreversible* — was done **once, by hand, over 55 files**. Then the checking
stopped and the thing it authorised kept running. **Another 26 logs went into the
object store permanently, scanned by nothing.**

And the exposure is worse than merely unguarded, because of what the tracking
test does. It goes RED until the previous cycle's log is committed. So if a cycle
ever pastes a live token into its log while narrating a gate failure, the guard
does not *permit* that token into git — it **forces** it there, and a push makes
it unrecallable. **The safety mechanism was also the delivery mechanism.**

**Fix:** `relay/cycle-log-reaches-git.test.ts` gains
`describe("cycle logs carry no credentials")` — 12 shape patterns: GitHub token,
GitHub fine-grained PAT, AWS access key id, Google API key, Anthropic key,
OpenAI-style key, Slack token, PEM private key, JWT, connection string with an
inline password, Sentry DSN including its key, and a secret env var assigned a
real value.

**Shape-based, never name-based, and that is the whole design.** A cycle log is
prose about the build; it names `DATABASE_URL` and `GOOGLE_CLIENT_SECRET`
constantly and must stay free to. It is barred only from carrying the **value**.
Every pattern was run against all 77 real logs *before* being encoded, and
returned zero, so the gate starts green on true history rather than being
switched on over a pile of exceptions.

## Proved it fires, both directions

**RED first.** Appended a `DATABASE_URL` assignment holding a Postgres
connection string with an inline password (not reproduced here — see the next
section for why) to a real cycle log, and watched it fail, naming the exact spot:

```
.bidlow/relay/log/cycle-078.md:297 — connection string with an inline password
```

Then restored the file byte-for-byte and watched **6/6 green**.

### The gate's first real firing was on this log

Worth recording, because it is the strongest evidence in this cycle and it was
not planned. The first draft of *this file* quoted the probe string verbatim, to
document what had been tested. Running the suite went **red**:

```
.bidlow/relay/log/cycle-079.md:99 — connection string with an inline password
```

So the gate caught a credential-shaped string in a real cycle log, written by a
real cycle, on the first cycle it existed — and it caught it **before** the log
was committed, which is the only point at which catching it is worth anything.
The string was redacted to prose and the suite went green.

Note also what did *not* work as an escape: writing the placeholder form with
`<user>` and `<password>` still matches, and should. A pattern that waved through
anything with angle brackets in it would be trivially defeated by a real
credential that happened to sit next to one. The right move is to describe the
shape in words, which is what this file now does.

It also carries a companion assertion that the pattern set matches a synthetic
all-credentials sample, so the scan can never report "clean" because a regex was
mistyped. The failure message says **redact AND rotate**, because deleting the
line is not a fix once it has been committed.

## Gates

* `npm run lint` — **0**
* `npm run typecheck` — **0**
* `npm test` — **3162 passed / 316 files**
* `npx vitest run relay/` — **113 passed / 8 files** (confirms the queue parser
  still reads row 38's new status cell)

## Honest limits, stated rather than rounded up

The **tracking** assertion can only fire **locally**. CI checks out tracked files,
so an untracked log does not exist there to be caught. The **credential scan**
does run in CI, but only over logs already committed — which is one push too
late to help. Both therefore rest on `npm test` being run inside the cycle. That
is the mandatory gate, and the 25 receipts above are evidence it is genuinely
happening rather than assumed.

Nothing here touches the send pipeline, any client data, or any migration. No
email was sent.
