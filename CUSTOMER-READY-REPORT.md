# Customer-Ready Report — OpensDoors Outreach

## STATUS: NOT YET GRADED

**No Customer-Ready audit has been run under the rubric. This file exists as the
record of that fact, not as a pass.** Do not cite it as evidence of readiness.

| Field | Value |
|---|---|
| Tier | P — Client Production |
| Customer-Ready grade | **Not graded** |
| Engineering grade | **Not formally graded** under `/bidlow-grade` (see below) |
| Last audit of any kind | 2026-06-21 (engineering/wiring audit, previous engagement) |
| This file created | 2026-08-09 |
| Sell gate | Engineering ≥ 8 **AND** Customer-Ready ≥ 8 — **cannot be evaluated yet** |

---

## Why this is blank rather than filled in

The Customer-Ready grade is defined as a judgement made by **walking the product
live as a customer**, not by reading code. That walk has not been performed in
this engagement. Writing a number here from code inspection or from memory would
be exactly the false-9 the standard exists to prevent.

## What IS known, and its actual weight

These are real, verified findings — but none of them is a Customer-Ready grade.

**Verified by running the gates on 2026-08-09** (branch `feat/zero-dns-send-profile`):

| Gate | Result |
|---|---|
| `npm run lint` | exit 0, no problems |
| `npm run typecheck` | exit 0, no errors |
| `npm test` | 1852 tests passed across 213 files |

**From the previous engagement (2026-06-21, not re-verified since):** an
exhaustive wiring/interactivity audit over the whole app found every control
bound to a real Prisma-backed action, with no dead links, stubs or
label-behaviour mismatches, and a live walk-through as a non-owner staff account
confirmed the owner-only gating held. That was an *engineering completeness*
verdict.

**Engineering completeness is necessary but not sufficient.** It answers "is the
code real and tested?" It does not answer "does a paying customer get a finished,
working, trustworthy product?"

## Known conditions that would cap a Customer-Ready grade today

Recorded so the eventual audit starts from facts rather than a blank page. Each
is evidenced elsewhere in the repo or in the engagement notes:

1. **Google OAuth app is in Testing mode.** Google-connected mailboxes expire
   their tokens roughly weekly, so staff must reconnect them on a recurring
   basis. Greg declined to publish the app. This is live, recurring, customer-
   visible friction.
2. **The warm-up ramp is switched off** (`MAILBOX_WARMUP_RAMP` is not `on`).
   The graduated 30-day volume ramp is written and tested but inert in
   production. The flat per-mailbox daily cap (30/day × 5 mailboxes) *is*
   enforced independently, so this is a missing protection, not an open floodgate.
3. **No e2e coverage of the core outreach journey.** The Playwright suite covers
   authentication, staff role boundaries and admin surfaces. Enrol → launch →
   send → reply is covered by unit and integration tests but not end-to-end.
4. **The zero-DNS send profile is on an unmerged branch.** The root-cause fix for
   the quarantine incident is committed to `feat/zero-dns-send-profile` and is
   **not deployed**.

## How to complete this report

Run the `customer-ready-audit` skill and walk the product live as a customer.
Replace this file wholesale with the dated result. Until then the sell gate is
not satisfiable, because half of it has no value.
