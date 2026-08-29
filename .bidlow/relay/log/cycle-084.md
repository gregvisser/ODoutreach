# Cycle 84 — row 72: the privacy policy described behaviour the product no longer has

## The PR sweep, first

`gh pr list --state open` returned `[]`. Zero open pull requests, so there was
nothing to merge, nothing red to read and nothing to leave a comment on. Cycle 78
cleared the backlog of seventeen and the start-of-cycle sweep has kept it at zero
since. Recorded rather than skipped, because "there were none" and "I did not
look" are different sentences and only the first one is true here.

## What the brief asked for, and whether it was right

It was right on the first half and stale on the second, in a way it had itself
anticipated.

**First half — correct in every particular.** `/privacy` really did say "Open
tracking is on by default and can be switched off per deployment", and both
halves of that sentence had been false since `c662e1b` (#268) on 2026-08-28. I
verified the claim against the code rather than against the commit messages: the
default is off because `Client.openTrackingEnabledAt` is a nullable column with
no default and no backfill (`prisma/schema.prisma:464`), and
`decideClientOpenTracking` returns `CLIENT_NOT_OPTED_IN` for a null
(`src/lib/tracking/client-open-tracking.ts:105`).

**Second half — the premise had expired, the instruction had not.** The brief
said the Sentry sentence "understates a configuration that currently enables
request and response bodies, database query data and stack-frame variables". That
was true when the row was written; it stopped being true when row 69 landed as
`DONE 62`, which is exactly the condition the brief gated on ("only AFTER row 69
lands"). So the sentence still needed rewriting, but in the opposite direction
from the one the wording implies: the configuration is now restrictive, and the
old sentence understates how *little* is sent, not how much. No correction to
QUEUE.md is warranted — the row's own gate handled it.

**One thing the brief did not know**, found during reconnaissance and worth
recording: production *also* has the global kill-switch `OPEN_TRACKING_PIXEL=off`
engaged. So today there are two independent reasons no pixel ships to anyone. I
deliberately did **not** put that in the policy — see the judgement calls below.

## The four things, written before anything was touched

1. **Files:** `src/app/privacy/page.tsx`,
   `src/components/legal/legal-page-shell.tsx`, and a new
   `src/app/privacy/privacy-policy-accuracy.test.ts`.
2. **Red-first test:** that new file, asserting both sides of the claim.
3. **Done:** the public page says tracking is off unless a customer turns it on,
   and cannot be turned on until the system has itself checked their DNS — and a
   test fails if the page and the code ever disagree again.
4. **Not touched:** the amber draft notice, the three named placeholders, the
   `/terms` prose, and any tracking or Sentry *runtime* behaviour. All four held.

## The test is a coupling, not a spell-check

This is the part worth reading. The obvious test here greps the page for the
absence of "on by default". That test would have passed happily on 28 August
while the code underneath it said the opposite, because prose is not compiled and
a grep over prose only ever proves what the prose says.

So `privacy-policy-accuracy.test.ts` asserts **both directions**:

* the **code** half drives the real `decideClientOpenTracking` and reads the real
  `SENTRY_DATA_COLLECTION`, asserting the behaviour the page describes;
* the **prose** half asserts the page describes it.

Either side moving alone is a failure, and the failure is reported from a file
named for the privacy policy — so whoever flips a default is told, by name, that
a public legal promise has just become untrue.

**Watched red first, in both directions.**

Red on the prose, before the page was edited — and note the split, which is the
whole design working: 5 code-side assertions passed (the behaviour was already
correct) and 4 prose-side assertions failed (the page was lying). That is the
defect, isolated by the test:

```
 FAIL  src/app/privacy/privacy-policy-accuracy.test.ts
   × no longer claims tracking is on by default or a per-deployment switch
   × states the default, the per-customer opt-in and the DNS precondition
   × no longer says identifiers are incidentally included
   × names what is withheld and what is still collected
      Tests  4 failed | 5 passed (9)
```

Red on the code, *after* the page was fixed — the direction that actually matters
for the future, since the page is now correct and the risk is the code drifting
away from it. I broke two things deliberately: `stackFrameVariables: false → true`
in `sentry-data-collection.ts`, and the null check in `decideClientOpenTracking`:

```
   × is OFF for a client that nobody has opted in, even with the global backstop permitting
     AssertionError: expected { enabled: false, …(1) } to deeply equal { enabled: false, …(1) }
   × only claims data is withheld where the collection policy withholds it
     AssertionError: expected true to be false
      Tests  2 failed | 8 passed (10)
```

Both reverted; `git diff --stat src/lib/` is empty. This is the row's own "assume
the seventh exists" guard discharged: the coupling is proven to *fire*, not merely
to exist.

The prose assertions are scoped to a single `<LegalSection>` by heading rather
than run over the whole file. Two reasons, both learned from the red run: a
whole-file match prints the whole file on failure, and eight kilobytes of red is
noise people learn to skim; and "per customer" already appears in the suppression
section, so a whole-file match would have gone **green** on the tracking claim
while the tracking section still said the opposite. The scoped helper throws a
written explanation if the heading is ever renamed.

## What the page now says

The tracking section states: off by default; on only for one individual customer
at a time; that the system resolves SPF, DKIM, DMARC and the tracking host itself
and must find all four correct; that the tracking host must be a subdomain of the
sending domain; that nobody's assurance is accepted in place of the lookup; that
it re-checks daily and switches itself back off after seven days; and that the
system-wide switch can only hold tracking off, never turn it on.

The Sentry line now names what is withheld — request and response bodies, HTTP
headers, cookies, sign-in identities, URL query strings, database values, stack
frame variables — and, deliberately, what is still sent: the stack trace, the
error message, the route, timings, our own source context and the shape of a
failing query with values stripped. "We send Sentry nothing" would have been the
comfortable sentence and it would have been false.

## Three judgement calls, all arguable

1. **I did not write the live kill-switch position into the policy.** "Tracking is
   currently off for everyone" is true today and is a claim about an Azure App
   Service setting that no test in this repository can hold. Putting an untestable
   live-config assertion on a public legal page is the precise mistake this row
   exists to correct, so the page describes the *mechanism* and not the current
   setting.
2. **I added one sentence beyond the brief**, to the paragraph the brief called
   accurate: the open timestamp is stored against the recipient's contact record,
   so "a single timestamp, and nothing else" is not the same as "anonymously". The
   old sentence was true but read more reassuringly than the data model warrants.
   Scope creep, defensibly — the row is about the page telling the truth.
3. **`lastUpdated` is now a per-page prop** defaulting to the shared constant.
   The privacy text changed today and the terms text did not, and one shared date
   would either backdate the change or claim a revision that never happened.
   `/terms` renders byte-identically.

## Gates — all run, all shown

* `npm run lint` — clean, no output.
* `npm run typecheck` — clean, no output.
* `npm test` — **319 files, 3215 tests, all passed.**
* `npm run build` — run; result recorded in the PR.

No schema change, no migration, no client data touched, and nothing that causes an
email to be sent. None of the three stop-and-ask conditions applies.

## For Greg

**Your action is now unblocked and nothing is waiting on me for it.** The Google
Auth Platform Publish button needs `/privacy` and `/terms` on the custom domain;
both have been live and publicly reachable since #302 merged, and the privacy page
is now also *accurate*. Publishing is what ends the seven-day refresh-token expiry
that keeps dropping Train Hugger's mailboxes. You have declined to publish before,
so this is recorded as yours rather than actioned.

Worth knowing before you publish: Google's reviewer reads that page. It now
describes the DNS precondition and the Sentry position in specific, checkable
terms, which reads considerably better under review than the sentence it replaced.

**Open questions: 1** — whether to publish the Google OAuth app. That is a
relationship and product decision, not a code one, and it is the only thing here
that is yours.
