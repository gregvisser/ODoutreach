# ODoutreach — BC-01 resolved, then ship

Read `.bidlow/STATE.md` first. You left the push blocked and the two decisions
open. Greg has answered both.

## Greg's ruling on the pilot shape

> *"We can see each other's prospects, yes — but the OpensDoors team will use the
> system to do outreach for their customers. So it's an internal tool to do cold
> outreach."*

**ONE INSTANCE: `opensdoors.bidlow.co.uk`.** Bidlow runs as a client workspace on
it. Do NOT revive the decommissioned Railway fork, and do NOT stand up a second
deployment. Your finding that `outreach.bidlow.co.uk` runs decommissioned code
with `commit: null` is what killed that plan — good catch; it would have sent
real prospect mail from the build that caused the quarantine.

## BC-01 — the spec asserted the wrong property. Amend it.

This is the important part, so read it before you touch anything.

BC-01 was written on 2026-08-11 for a model where staff belong to specific
clients and must not see the others. **That is not what this product is.**
OpensDoors is an agency: its staff run outreach across all of its customers, and
`getAccessibleClientIds` returning every live client is the intended design, not
a defect. The spec was wrong about the product, so the spec changes — which is
exactly the case the frozen boundary exists to allow, with a name on it.

**But do not simply delete the rule, because it is protecting two different
things and only one of them is wrong.**

- **ACCESS isolation between staff — deliberately absent.** All OpensDoors staff
  see all OpensDoors clients. Recorded as a decision with its trigger, not as a
  gap.
- **DATA isolation between client workspaces — must hold absolutely, and is
  currently untested.** A contact belongs to exactly one client. A send for
  Client A must never draw a recipient from Client B's list. A reply must attach
  to the right client. A client's suppression list must apply to that client's
  sends. Reporting figures must not mix clients.

That second set is the one that matters commercially, and BC-01 never tested it.
A staff member reading a list they were always going to be allowed to read is
awkward. **Emailing Client B's prospects on Client A's behalf is an incident** —
worse than the leak you found, and nothing currently proves it cannot happen.

So the rewrite is not a softening. The current tests assert a property that does
not apply while leaving the property that does apply unguarded.

### What to do

1. Rewrite `specs/BC-01-tenant-isolation.md`:
   - Retitle to what it now governs: **workspace data isolation**.
   - Record the access decision verbatim with Greg's words above, dated
     2026-08-23, and the **trigger that reverses it**: the day a second agency
     shares an instance, or OpensDoors needs a staff member scoped to one client
     (a contractor, say). Note that `ClientMembership` already exists and is
     inert, so it is the mechanism when that day comes — and that selling a
     shared instance to two agencies is a **rebuild, not a feature**.
   - Keep E-02 (a staff user with no membership sees nothing) and E-03
     (404, never 403) — both still apply and are still worth having.
   - Keep the note that the API surface, exports, search and reports are where
     permission is routinely forgotten. Still true, still a gap, still named.
2. Amend the freeze in the same act, so the change carries a name:
   ```
   node <standards>/scripts/freeze-specs.mjs --amend specs/BC-01-tenant-isolation.md \
     --by "Greg" --what "BC-01 asserted staff-level isolation the product deliberately does not have; retargeted to workspace DATA isolation, with the access decision and its reversal trigger recorded"
   ```
3. Rewrite `e2e/cross-tenant.spec.ts` to test the data boundary. **RED first** —
   and be honest about which of these already pass. Assert at minimum:
   - a send composed for Client A never resolves a recipient belonging to Client B
   - Client A's suppression entries do not suppress Client B's sends, and vice
     versa (confirm the intended behaviour in the code before asserting it — do
     not guess which way round it should be)
   - a reply lands against the client whose mailbox received it
   - reporting counts for Client A exclude Client B's rows
   - E-02 and E-03 still hold
4. Then `.bidlow/EVIDENCE.json` records a genuine green e2e run and the ship gate
   stops refusing.

**If any of those data-boundary tests fails, STOP and report.** That is a real
defect and it outranks Monday.

## Then ship

Standing rule: always commit, always push the branch, always open the PR, always
let CI run. **Greg merges.** Not friction — `deploy-production.yml` runs
`prisma migrate deploy` against production *before* the Azure login step.

- Push `integrate/monday-pilot`. Open the PR. Report the CI result.
- List every commit a merge deploys — you established it is more than the brief
  assumed. Greg merges something he has seen.
- After the deploy, verify `/api/build-info` reports the new commit. A green
  workflow is not evidence; you found the stale-server trap yourself.

## Then the pilot

- OpensDoors' own company and Bidlow, both as client workspaces on the one
  instance. Hand-checked lists only.
- The 20/day, 10/mailbox cap stands. Do not raise it because a deploy went well.
- **The 0% bounce reading is now MORE concerning, not less.** You established
  `MAILBOX_BOUNCE_DETECTION_ENABLED` is `true` in production — so something is
  measuring and reporting nothing across 1,209 sends. Spend a little time on why
  before real prospects, and if you cannot settle it, say so and the cap holds.
- Re-run `/bidlow-prove`, re-grade Customer-Ready honestly. Below 8 is fine if
  said out loud.

## Also

- The `sentProofMissing` seed-exclusion defect you found (`outreach-metrics.ts`
  ~line 226, `seedExclusion` missing from the step-send count) — its own commit,
  with a test.
- The DNC related-domain per-client setting — **its own PR, its own migration**,
  after this one lands. Your design note is right: related domains cannot be
  inferred from a string, so it is an explicit per-client family list.

## Report back

- BC-01 before and after, quoted, and which data-boundary tests were RED first.
- CI result, the commit list a merge deploys, `/api/build-info` after deploying.
- Anything here that does not survive contact with the code. You were right
  about the Railway fork, the installer, the CI evidence gap and the bounce flag.
  I was wrong on all four. Assume the same rate applies to this document.
