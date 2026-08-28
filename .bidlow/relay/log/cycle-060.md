# Cycle 60 — the switch, and the door it is NOT allowed to open

Queue item 40: Phase 2. Cycle 59 shipped (1) the four-at-a-time gate and (2a)
the three-tier grade, and **deliberately held (2b) the autonomous-send toggle
and (3) the `autonomous-actor-guard.ts` re-scope**, on the reasoning that a
toggle nothing consults and a guard consulting a toggle that does not exist are
the same defect wearing different clothes. They only fire as a pair.

**This cycle is that pair.** Shipped together, in one PR, for that exact reason.

---

## The PR sweep, first

Nine open. Only **#297** was `MERGEABLE` — everything else was `CONFLICTING`.

* **#297** `docs(state): record cycle 49` — checks green, only `BEHIND`.
  **Verified before merging rather than assumed**, because cycle 59's log
  records the trap: a STATE.md PR recording an *older* cycle writes a regression
  over a newer file. Checked main's `.bidlow/STATE.md` (cycle **47**) against the
  PR (cycle **49**) — a forward move — and confirmed the commit it pins,
  `be2dc01`, really is in main's history. Updated the branch and merged.
* **#292, #268, #260, #212, #211, #208** — all `CONFLICTING`, all with **green
  checks**. Commented on each rather than leaving them silent, because the green
  tick is actively misleading here: **those checks ran against an older base, so
  green does not mean mergeable.** Each now says so in one comment.
* **#301, #302** — `CONFLICTING` *and* **E2E red**. Not force-merged; the brief
  is explicit that a red PR is not mine to force. Commented with both reasons.

**9 open at the start, 8 at the end.** The honest number is one, because the
other seven need a rebase each, and a rebase is not a sweep.

---

## What was built

### The switch

`Client.autonomousSendEnabled` — **three states, and the third one is the whole
point.**

| value | means | machine may send |
|---|---|---|
| `true` | a named person chose machine sending | yes |
| `false` | a named person chose human sending | no |
| `null` | **nobody has decided** | **no** |

A plain boolean would collapse "we decided this client sends by hand" into
"nobody has looked at this client yet". Both refuse — but only one of them is a
decision anybody made, and the screen has to be able to say which. The migration
applies **no default**, deliberately: defaulting the column would manufacture a
decision nobody made, for every existing client, silently.

### The signature, which is a requirement and not decoration

> Greg: *"there has to be a signature shown who switched the toggle and who set
> the grade of the customer."*

Rendered **next to the control** — "Set to Machine sending by Sophie, 28 Aug
14:02" — on the account card, beside cycle 59's grade card and following it line
for line so the two controls behave identically. The stamp on the client is the
latest decision; the `AuditLog` row (shape borrowed from `bounce-suppression.ts`)
is every decision. Both, because overwriting the stamp must never lose the
history. `previousEnabled: null` in the metadata is meaningful — it records that
this was the FIRST decision anyone ever made about that client.

Timestamp built from UTC parts, reusing cycle 59's `formatAttributionTimestamp`.
This repo has already shipped a hydration mismatch on `toLocaleString` once.

### The guard, RE-SCOPED and not deleted

The brief was emphatic, so this is worth stating precisely. `evaluateAutonomousActorGuard`
is unchanged in shape: still pure, still no Prisma/env/clock, still decided at
dispatch, still fails closed at every branch. It gained **one more question**.

**THE DECISION I MADE, AND IT IS THE LOAD-BEARING ONE:**

**The allowlist and the switch are an AND, never a replacement.**

The queue row says to change "what it consults, from a static one-client
allowlist to that client's toggle" — a replacement. I did not do that, and here
is why, because a future cycle will otherwise read this as a cycle ignoring its
brief.

They are two different questions with two different owners:

* the **relay allowlist** is the operational envelope of *an unattended AI agent
  editing this repository at 3am*. It answers "may a machine act for anyone at
  all right now, and for whom".
* the **client switch** is the commercial and contractual decision. It answers
  "has this particular client been signed up to machine sending, and by whom".

Greg approved the first sentence of the spec — *"the machine can send for all
customers from now on"* — about **the product's** sending. My own cycle brief
carries the hard rule that real email leaves the building for `bidlowai` only,
enforced in this exact file. Replacing the allowlist would have deleted that rule
as a side effect of a change nobody described as deleting it.

Composing them as an AND is the resolution, and it is not a fudge:

* **Every red-first assertion the spec named still passes.** Toggle OFF refuses.
  Toggle UNSET refuses. `HUMAN_STAFF` is untouched. Enabling client A does not
  enable client B.
* **The AND can only ever be MORE closed.** No value of the new question permits
  anything the old one refused. For a gate whose far side is an email to a
  stranger, that is the only safe direction to move in.
* **It is a knob, not a wall.** Widening the envelope is one environment
  variable (`AUTONOMOUS_SEND_ALLOWLIST`) with no code change — deliberately, so
  it stays Greg's decision and not a cycle's to make by accident.

There is a test asserting the AND directly (`the switch cannot open a door the
allowlist keeps shut`), so a later cycle cannot quietly loosen it to an OR
without going red.

---

## Proving it FIRES — the brief said to assume the seventh exists

Two reds, both watched before any fix.

**1. The pure decision.** New assertions written against a guard that did not
know the field existed: **6 failed / 17 passed**. The red is meaningful rather
than decorative because the tests that PASSED are exactly the ones that should
pass against a guard ignoring the switch — `HUMAN_STAFF` untouched, and the
allowlist still shutting the door. 23/23 after.

**2. The real dispatcher, which is the one that matters.** After wiring
`execute-one.ts`, `execute-one-autonomous-gate.test.ts` went red on **exactly one
test: "ALLOWS a send for Bidlow"**.

That single red is the evidence. It says the allowlisted client — the one client
this system was permitted to machine-send for — is now **refused at the point of
dispatch** because nobody has set its switch, and **nothing was handed to Gmail**.
Not "the guard returned a refusal": `sendGmail` was never called. A live
behaviour change at the real dispatcher, in the fail-closed direction, proven by
a test that was capable of failing and did.

Every assertion in the new dispatch block ends at `sendGmail` for that reason. A
switch that is consulted but not obeyed is precisely the defect this project
keeps shipping.

The refusal is also **legible on the row** — `AUTONOMOUS_CLIENT_SEND_UNSET` with
a reason naming the switch. Cycle 59 found the inverse of this in its own wiring
(a gate reporting "no mailbox capacity" when the real reason was a timer) and the
lesson carried: an operator told the wrong reason goes hunting for a problem that
does not exist.

---

## A red on `main` that was not mine, and was worth the detour

`npm test` failed on `relay/queue-parser.test.ts` — 2 tests, both shells. I
touched nothing in `relay/`, and it reproduced with my `.bidlow` working-tree
changes stashed, so it was **pre-existing on `main`**.

Cause: commit **`04ddf66`** deliberately changed the relay so that **PARTIAL is a
status it TAKES** — *"PARTIAL means some of this is done and some of it is not,
which is a row with work left in it; refusing to take it is refusing to do the
work."* It changed the behaviour and left `queue-parser.test.ts` asserting the
old rule.

**This is the project's signature defect caught in the act — except this time the
artefact went RED instead of reporting success for ever.** That is the system
working, and it is worth recording as a data point against the six instances in
QUEUE.md where it did not.

Fixed rather than left, because a red on `main` reddens every PR behind it,
including this one. **The test's anchor is unchanged and still the whole point**:
`-match 'BLOCKED'` was an unanchored substring test, so the word "blocked" inside
a status's prose read as a BLOCKED status. A status is what the cell STARTS with.
Only the consequence changed — the row is now picked up rather than stopping the
queue with the wrong reason. The comment in the test records why it moved.

---

## Gates — run, not assumed

| gate | result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **2798 passed**, 285 files (cycle 59: 2772 / 283) |

Migration is **purely additive** — 3 nullable columns, 1 FK to the existing
`StaffUser`, 1 index. No existing column altered, no default, no backfill.
Dropping all of it restores today's behaviour exactly (the guard falls back to
the allowlist alone), so it passes the brief's own test for what is mine to
merge.

**Nothing was sent. No client data was touched.** The only live behaviour change
is a refusal that did not exist yesterday.

---

## Open questions: 2

1. **Should the switch also govern the app's own cron, not just the relay?**
   Greg's sentence — *"a switch to make it machine sending or human sending"* —
   reads broader than the relay gate. But the guard block is skipped entirely
   when the relay is not running, and that is load-bearing: making the switch
   apply unconditionally would **stop live production sending for every client
   on day one**, because no client has a switch set and an unset switch refuses.
   That is an outage wearing a safety jacket, and it is not something to smuggle
   into a cycle about the guard. It needs a deliberate decision about defaults
   and a migration plan. **Flagging, not doing.**
2. **Nothing is machine-sendable until someone opens a client and chooses.**
   That is correct and by design, but it means the feature is visible and inert
   until a human acts — including for `bidlowai`. Worth Greg knowing so it is not
   mistaken for the feature not working.

## Interrupted

This cycle was still marked 'running' when the watcher started again at 2026-08-28 08:25:41, so it was stopped part-way through.

Whatever it had already done on disk is done; whatever it had not is not. This note records that the cycle ended without finishing - it does NOT undo anything.
