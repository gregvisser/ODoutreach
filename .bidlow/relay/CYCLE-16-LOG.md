# Cycle 16 — queue item 29 — log

Date: 2026-08-26. Plan of record: `CYCLE-16-PLAN.md`.

---

## (a) Fix the lie — **DONE**, PR #245

Branch `fix/launch-readiness-requires-a-sequence`, off `main`, commit `0656695`.

### What was actually wrong

The queue item's description was accurate in every particular. I verified the
mechanism in code rather than from the screenshot.

`outreachPilotRunnable` is **a fact about mailboxes**:

```ts
// src/app/(app)/clients/[clientId]/page.tsx:88
const outreachPilotRunnable =
  bundle.hasGovernedMailbox && bundle.oauthReadyForGovernedTest && bundle.poolCanSendPilot;
```

It asks "could a governed mailbox send something today?" and never looks at
sequences, steps or enrolments. That single boolean was the readiness signal for
all four contradicting surfaces:

| Surface | Was |
|---|---|
| `client-launch-state.ts:212` | readiness row pill `ready`, "Ready to launch" |
| `client-launch-state.ts:385` | workflow pill "6 Outreach — complete" |
| `client-launch-state.ts:273` | header badge "Ready to launch" |
| `getting-started-view-model.ts:133` | checklist item 8 ticked |

BidlowAI has 1 connected mailbox at 30/day, so it was `true`, and the whole
module reported ready on that alone.

### The finding worth keeping

**The gate was never wrong. Only the display was.**
`evaluateClientLaunchApproval` (`client-launch-approval.ts:138-145`) has always
blocked on `hasProductionLaunchableSequence` and `enrolledContactsCount < 1`. So
BidlowAI could never actually have been auto-promoted or approved — the rail was
simply reporting a different answer than the gate would have given, on the same
screen, from the same request.

**And both call sites were already loading both signals.** `page.tsx` and
`launch-approval.ts` each ran `getClientHasProductionLaunchableSequence(...)` and
`clientEmailSequenceEnrollment.count(...)`, then dropped the enrolment count
before building the snapshot. *A query whose result is discarded is
indistinguishable from a query that was never written.* This is the same defect
shape as the six "built, wired, never fired" instances QUEUE.md records — the
work was done and then not connected.

### Red first — watched it fail

10 assertions failed against the unmodified code: `ready` where it should be
`needs_attention`, `complete` where it should not be, "Ready to launch" in the
header badge. **Two pre-existing tests asserted the defect verbatim**
(`client-launch-state.test.ts:218,230` expected `"Ready to launch"` with
`hasProductionLaunchableSequence: false`) and are corrected in this PR. Those two
corrections are the strongest evidence the behaviour genuinely changed.

### Proving it fires, not just exists

1. **The compiler.** `hasProductionLaunchableSequence` and `enrolledContactsCount`
   are now **required** fields on `ClientLaunchSnapshotInput`. An optional field
   defaulting to "not ready" fails closed — but *silently*, which is how this got
   here. Required means a call site that forgets to wire it fails
   `npm run typecheck`, a merge-blocking gate. Running typecheck confirmed both
   production call sites already supply both values.
2. **`src/lib/clients/outreach-readiness-wiring.test.ts`** pins both call sites by
   name, so deleting one — or re-adding a `?? 0` default that lets a caller skip
   the wiring — goes red.
3. **`opensdoors` is pinned too** (10 real sequences, real enrolments) so the fix
   cannot regress a workspace that genuinely is ready.

### Gates — run, not assumed

All run **locally**, on a clean tree, on `dc5de45`, with `.next` cleared first:

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors (1 warning, pre-existing, in untracked `relay-status.mjs`) |
| `npm run typecheck` | clean |
| `npm test` | **2351 passed / 247 files** |
| `npm run build` | green |
| **CI** | ❌ **NOT MET — never scheduled. See below.** |

No schema change, no migration, no send-path change.

#### Two corrections to my own earlier numbers

1. I first quoted **2354 tests / 248 files**. That run was measured on a
   working tree still carrying a test file from
   `feat/related-domain-discovery-wiring`. The honest figure for this branch is
   **2351 / 247**. Commit message and PR body both corrected.
2. A typecheck run reported three errors in
   `.next/types/.../discover-families/route.ts`. That was a stale build cache
   resolving types from the other branch, not a real failure. Clearing `.next`
   and re-running gave a clean result.

#### CI never ran — and I did not merge

GitHub Actions created **no workflow run** for this PR. Verified rather than
assumed: `check-runs` for `dc5de45` returns `total_count: 0`, and the
`actions/runs` list filtered to this branch is empty, after **three pushes, a
close/reopen cycle, and a further six-minute wait**.

Repo-wide this afternoon: two CI runs on the other branch stuck `queued` for
50+ minutes, plus several `startup_failure` entries across `CI`, `Alerts` and
`Relay alert`. Runners are alive — the scheduled `Process outbound queue` job
succeeded at 16:04Z — so this is GitHub-side scheduling, not this change.

`mergeStateStatus` is `BLOCKED`. **PR #245 is open and unmerged.** Per the
tier-verification rule, a gate that cannot be run is NOT met, so this cycle
does not claim a green CI gate. Unsticking Actions and merging is a human step.

---

## (b) Build BidlowAI a staged sequence — **NOT DONE. Blocked on a decision that is Greg's.**

I did not do this, and I am not going to work around it. Here is exactly why.

### Blocker 1 — there is no network path to the production database

The live client database is `pg-opensdoors-outreach-prod-01`. Its firewall has
**exactly one rule**:

```
EndIpAddress    Name                                                              StartIpAddress
--------------  ----------------------------------------------------------------  --------------
0.0.0.0         AllowAllAzureServicesAndResourcesWithinAzureIps_2026-4-16_19-53-4  0.0.0.0
```

That is the special "Azure services only" entry. No external address is
permitted. I confirmed this empirically, not by reading config: I pulled the prod
`DATABASE_URL` from App Service settings and a connection attempt died with
`Connection terminated due to connection timeout`.

To proceed I would have had to **add a firewall rule opening a paying client's
production database to my machine's public IP** — autonomously, overnight,
unsupervised. That is a change to the security posture of a live client system.
It is reversible, but reversible is not the same as mine to make. Per the cycle
rules, a decision about a client relationship or a security boundary is Greg's,
so I stopped and wrote it down.

### Blocker 2 — the brief the copy must come from is inside that same database

The item says to write the introduction "**from the BidlowAI brief**". The brief
lives in the `Client` row I cannot read. Without it I would be inventing
BidlowAI's positioning, offer and USPs, and putting the invention into an email
that goes to real prospects under Greg's name. That is not a gap I should paper
over with a plausible guess.

### What I deliberately did NOT do

- Did not add a firewall rule to the production database.
- Did not forge a staff session against production to drive the app over HTTP.
- Did not hand-write sequence/template/enrolment rows via SQL. Even with access
  this would have been wrong: it bypasses the product's own creation path and
  would have produced records the real code never made — precisely the defect
  class this project is worst at.
- Did not send anything. No email left the building for any client.

### Credential hygiene

The prod `DATABASE_URL` was written only to `.env.prod.local` / `.raw`
(both matched by the gitignored `.env*` rule, verified with `git check-ignore`),
never echoed unmasked, and **both files were deleted** before the commit. Nothing
of it is in git or in this log.

---

## The part of (b) that (a) already delivered

This is worth stating plainly, because it changes what tomorrow looks like.

**Before this fix, nothing on the screen would have told Greg a sequence was
missing.** The overview said "Ready to launch". He would have opened Outreach in
the meeting and found "No sequences yet."

After it, the same workspace says:

- header badge → **"Build a sequence"**
- Launch readiness rail → **"Outreach · Needs attention · Needs a launchable sequence"**
- Getting started → no longer contradicts itself

### The five-minute path to done, through the product's own code

I verified this path exists rather than assuming it. Creating a sequence with an
introduction step from the Outreach tab calls `autoPrepareSequenceForLaunch`
(`sequence-actions.ts:191` and `:249` — confirmed by grep, and covered by
`outreach-pr122-launch-ready.test.ts`), which then does, **without sending
anything**:

```
DRAFT → READY_FOR_REVIEW → APPROVED
  → enrollSequenceContacts()      (suppression applied at enrolment —
                                   the suppressed BidlowAI contact stays suppressed)
  → planSequenceStepSends()       (records only, the INTRODUCTION step)
```

So: Outreach → new sequence → attach the existing list → write the introduction
→ save. Enrolment and recipient resolution happen automatically. Then "Generate
preview" shows the exact email, and the launch button sits armed and unpressed.

That is strictly better than the script part (b) asked for, because it is the
product's real path rather than a parallel one, and because the copy is written
by the person whose name is on the email.

---

## The one question for Greg

> **Do you want the relay to have write access to the production client
> database?** Doing (b) autonomously requires opening `pg-opensdoors-outreach-prod-01`
> to an external IP. I did not do it. If the answer is yes, say so and say
> whether the rule should be removed again afterwards — and I will still need
> BidlowAI's brief content, or your sign-off on copy I draft blind.
>
> If the answer is no, (b) is a five-minute job for you in the UI, and after
> PR #245 the screen finally tells you it needs doing.

**Open questions: 1.**
