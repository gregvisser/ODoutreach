# Cycle 61 — row 41: the system resolves the DNS itself, and never trusts a tick-box

## What the row asked for

Tracking is approved, but it may only activate once a customer's DNS is real —
and the system must **verify that itself**, per customer, because "a human
confirming DNS is in place is exactly the human error this product exists to
remove, and the quarantine is what it costs."

## What shipped

Merged as `7250cc7` (PR #309), on top of `c662e1b` (PR #268, rescued and merged
this cycle — see the sweep below).

### The four checks — `src/lib/tracking/tracking-dns-checks.ts`

Pure functions taking already-resolved answers, so every judgement is red-first
testable from a literal with no network involved.

* **SPF** — must authorise the platform that actually sends **and** end `-all`.
  Refuses `~all`, `?all`, `+all`; refuses two SPF records (RFC 7208 §4.5 makes
  that a permerror, so receivers ignore SPF entirely — two "correct" records are
  worse than one); refuses an SPF that names the wrong platform.
* **DKIM** — Microsoft's **two** selector CNAMEs must both resolve, because it
  rotates between them and a domain with only `selector1` signs correctly today
  and stops without warning. Google publishes a **TXT** key instead, so a
  CNAME-only check would have declared every correctly-configured Google domain
  broken. An empty `p=` is a **revoked** key, so presence alone is not the check.
* **DMARC** — must exist at `_dmarc` **with a policy tag**. A record with no `p=`
  is syntactically valid and instructs receivers to do nothing.
* **Tracking host** — must be a subdomain of the **sending** domain, CNAME to us,
  and serve our app over a valid certificate. The alignment condition is the 2026
  quarantine written as a single assertion.

### The gate applies in three places, and refuses in all three

1. **Enabling** runs the checks LIVE at the moment of the click, not against a
   stored flag. A thrown lookup is a refusal, never a pass.
2. **Dispatch** — `decideClientOpenTracking` requires a passing check before a
   pixel is minted. New off-reasons `EMAIL_AUTH_NOT_VERIFIED` / `EMAIL_AUTH_STALE`.
3. **The scheduled sweep** (`tracking-dns-sweep.yml`, 05:30 UTC daily, before the
   07:00 send window) re-checks every tracked client and switches off regressions.

### THE DECISION A LATER CYCLE MUST NOT UNDO

**The sweep is not what makes this safe.** `TRACKING_DNS_MAX_AGE_DAYS = 7`
expires a verification **at dispatch, by arithmetic**. If the schedule silently
stops firing, tracking closes itself within a week with nothing running at all.

This was deliberate and it is the direct answer to this repo's worst defect —
six recorded instances of something built, wired, reporting success and never
firing. If a later cycle "simplifies" this by trusting the cron, the gate
becomes a decoration the first time Actions is quiet. `persistTrackingDnsCheck`
also CLEARS `trackingDnsVerifiedAt` on a fail rather than leaving it to age out,
because we already know the DNS is wrong right now.

### Isolation — the risk Greg named himself

Asserted directly, including **inside the sweep's shared loop**, which is where a
leak would actually happen: one shared resolver, one loop, one mistaken variable.
Enabling A leaves B untracked; a link minted for A can never carry B's host; B
failing its re-check does not disturb A.

## Proven to FIRE, red first, three times over

* **`tracking-dns-checks.test.ts`** — went red on a missing module, then 33 green.
* **`client-open-tracking.test.ts`** — the new gate went red on exactly 3 tests
  while the 23 that should still pass passed. A meaningful red, not a decorative
  one.
* **`open-tracking-opt-in.test.ts`** — 4 red, 9 passing.
* **THE REAL DISPATCHER went red.** Adding the gate broke exactly one assertion
  in `execute-one-open-tracking.test.ts` — "DOES send a pixel… once opted in and
  verified" — because the real send path now refuses a pixel for a client whose
  DNS was never checked. That is the proof the gate is in the send path and not
  merely in a helper.
* **AGAINST REAL DNS, not fixtures.** The live resolver was run against real
  domains and the sweep's disable callback fired for real.

## FINDING FOR GREG — the client's own domain fails this gate today

The live run read `opensdoors.co.uk`:

    v=spf1 include:spf.protection.outlook.com ~all

**`~all`, not `-all`.** DKIM resolves (both Microsoft selectors) and DMARC is
`p=quarantine`, so two of four pass — but SPF does not, and neither does the
tracking host (`go.opensdoors.co.uk` has no CNAME). OpensDoors could not switch
tracking on for themselves today.

Corroboration that the checker is right rather than merely strict:
`bidlow.co.uk` passed SPF, DKIM **and** DMARC, which matches what we already
independently know to be true of that domain. Nothing was changed in anyone's DNS.

## Migration

`20260828120000_tracking_dns_verification` — three nullable columns, no backfill,
no existing column read or rewritten. Additive, so mine to merge. NULL means
"never checked", which is the truth for every existing client **and** the safe
state; a backfill would have manufactured evidence of a check that never
happened, which is the exact failure the row exists to prevent.

## Gates

`lint` clean · `typecheck` clean · **2867 tests / 290 files** green.
Nothing sent. No client data touched.

## The PR sweep — 9 open at the start, 1 left

Every one of the six "green" PRs had gone CONFLICTING. The rot the brief warns
about is real and it is fast.

**Rescued and merged / made green:**

* **#268** *(per-client open tracking)* — 35 commits behind, 2 conflicts. Rescued,
  gates re-run, **merged (`c662e1b`)**. This was row 41's foundation, so it went
  first. Its migration was renamed `20260827090000` → `20260828080000` to sort
  after main's; it had never been applied anywhere, so renaming was free.
* **#308** *(cycle 60's own autonomous-send switch)* — brought up to date, clean
  merge, gates green, pushed. Was left behind by its own cycle.
* **#301** and **#302** — both RED, and **both failing on the same unrelated
  test** (`j5-journey.integration.test.ts`). Not their fault: both were 9 commits
  behind a base where that test was broken, and main has been green on it since
  `b15cfe4`. Brought up to date, gates green, pushed. Neither needed a code fix.

**Closed as SUPERSEDED, each with a comment saying why so no future cycle
re-derives it:**

* **#212** — main already has both artefacts. Not merely stale: the two sides
  record **different answers to the same interview question** (whether a DNC
  record travels when a prospect moves client). Only Greg can settle that, and
  merging would have picked one by accident.
* **#260** — main already has the fix, and a stronger version: 30s rather than
  60s, plus `powershell-timeout-budget.test.ts` asserting the budget is actually
  in force.
* **#211** — COVERAGE.json byte-identical; STATE.md 2,261 lines behind. One hunk
  must never merge in any form: it tracks `.bidlow/.state-nudged`, which main
  deliberately gitignores.
* **#292** — superseded by `8ca6f64` (#295), which fixed the same defect later.
  Not merged mechanically because the conflicts are **factual disagreements about
  the live screen**, plus a binary PNG that is generated by an e2e spec and has to
  be re-captured to match whichever caption wins.
* **#208** — superseded by `7c2307c` (#244) and extended by `237986b` (#273).
  `add/add` conflicts because two branches built the same screen independently;
  main's is the further-developed one and carries #273's work.

## Still open

Row 41's last clause: "Only once all of that is true may these be built:
opens-based priority, click-to-call-task, hot-prospect alerts, subject-line retry
on non-open." Those are NOT built, correctly — they are the next row's work, not
this one's, and they now have a gate to sit behind.
