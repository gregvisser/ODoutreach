# Cycle 64 — row 50: the OAuth state expiry that was written and never read

**Outcome: fixed with an expiry CHECK and deliberately no sweep, proven red
first on both callbacks, all four gates green. PR #315, commit `6ee61f0`.**

Three things were found along the way that are not this row and are queued
rather than smuggled in: the row-51 log fix is merged but **not running**,
QUEUE.md has a shadow second table, and pressing Connect deletes a working
mailbox's credential before the operator has signed in.

## The PR sweep found nothing to do

`gh pr list --state open` returned `[]`. Zero open PRs. The structural fix
described in the brief — putting the sweep at the *start* of the next cycle —
is working; cycles 62 and 63 cleared what they opened. Recording the empty
result explicitly, because "I did the sweep and there was nothing" and "I
forgot the sweep" look identical in a log that omits it.

## The brief had one wrong fact, corrected here

The brief cites the callbacks as `src/app/api/mailboxes/{google,microsoft}/callback/route.ts`.
They are actually at **`src/app/api/mailbox-oauth/...`**. Minor, but it is the
kind of thing that costs a cycle its first ten minutes, so it is written down
rather than silently worked around.

Everything else in the brief checked out exactly: the state is generated at
`mailbox-connection-actions.ts:89-107` with a 15-minute expiry, both callbacks
resolve the row with `findFirst({ where: { oauthState: state } })` and no
predicate on `oauthStateExpiresAt`, and the column is written and never read.

## I measured the exposure before writing code, because the brief said to

It was right to say so. The answer changed the shape of the fix.

**What made it narrow:**

* the state is 32 bytes of CSPRNG — 256 bits — behind a `UNIQUE` index
  (`ClientMailboxIdentity_oauthState_key`), so it cannot be guessed;
* replaying it also requires a valid provider `code` for that same flow;
* even holding both, the account-alignment guard refuses a sign-in that is not
  the mailbox on the row — the guard cycle 56 gave its own reason code.

Both prior audits reached the same verdict independently
(`docs/audits/odoutreach-audit-report.md` L7, "defense-in-depth weakening
only"). So the realistic harm was **a stale-token window, not an open door**.

**One correction to the brief's framing.** It says "the state is single-use in
practice (the success and failure paths both null it out)". Not quite: the
`missing_code` and `mailbox_removed` paths both return *without* clearing the
state. It survives those. This does not change the verdict — those paths spend
nothing — but "single-use on every path" was not true, and the fix should not
have rested on it.

## Why an expiry check and NOT a sweep

The brief asked me to decide deliberately and say which and why. **Expiry check
only.**

Once the callback refuses an out-of-date state, the leftover row holds an inert
string that opens nothing. A periodic sweep would delete a value that has
already stopped meaning anything — real new moving parts, a scheduler, and a
failure mode, bought for zero security gain.

And there is a sharper reason. This repository's most expensive recurring
defect, recorded ten times in QUEUE.md, is machinery that is built, wired,
reports success and never fires. **A cron job whose only job is cosmetic
tidying is precisely that shape** — nobody would ever notice it had stopped.
Adding one to close a LOW finding would be trading a real defect class for an
imaginary one. The reasoning is written into the module header so the next
cycle does not re-litigate it from scratch.

## What shipped

A new pure module, `src/lib/mailboxes/mailbox-oauth-state-expiry.ts`, holding
the TTL **and** the predicate — and `prepareMailboxOAuthConnection` now imports
it instead of keeping its own `OAUTH_STATE_TTL_MS`. That is the part I care
about most: the lifetime that is *written* and the lifetime that is *enforced*
are now literally one constant. A value written in one place and read in
another that could drift is the whole of the original defect, in miniature.

**It fails closed on a null expiry.** I checked before choosing that: the only
writer of a non-null `oauthState` in the entire codebase is
`mailbox-connection-actions.ts:100`, and it always writes the expiry in the
same `update`; both columns arrived in the same migration
(`20260420120000_mailbox_oauth_connection`). So a state with no expiry is a row
this codebase cannot produce, and refusing it cannot break a real flow.

**Its own reason code, `expired_state`.** Not `unknown_state` — the brief was
emphatic and it was right. A link that timed out and a link that was never
issued are different facts and the operator's next move differs. While there I
also had to change the *existing* `unknown_state` wording, which said "That
sign-in link has expired or was already used": leaving that in place would have
recreated the exact ambiguity this row exists to remove. It now says "was not
recognised". A test asserts the two messages differ and that the unknown one no
longer claims expiry.

**The gate sits first**, immediately after the row lookup, ahead of the
workspace-removal check. There is no security difference in the ordering — no
path between them spends the state — so I chose it on a different ground: the
invariant "this token is dead" should be established before anything else
reasons about the row, so that no future edit can slip work in front of the
gate. The trade-off, noted honestly: for the rare row that is both removed *and*
expired, the operator now gets the expiry message rather than the removal one.

**It writes nothing.** The state is already dead; a read-only refusal also
means the message stays the same if the operator refreshes the page.

## Proving it fires

It went genuinely red first, and the red was more interesting than expected:

```
× refuses a state whose expiry has passed, with its own reason
  → expected 'callback_failed' to be 'expired_state'
× refuses a state row that carries no expiry at all
  → expected null to be 'expired_state'
```

`callback_failed`, not a clean pass — meaning the expired state had **already
reached the token exchange** before failing for an unrelated reason. That is
the exposure demonstrated rather than argued. The second case returned
`connected` outright.

**The Microsoft callback had no test at all.** A fix proven on one of two
identical callbacks is a fix proven on half the app, so it has one now: the
expiry refusal, the null-expiry refusal, a still-connects-inside-the-window
case, a still-says-`callback_failed`-for-real-failures case, and the
tenant-admin-consent path, which arrives with no state and had to be shown
undisturbed.

Both route suites read the redirect back through
`readMailboxOAuthSearchParams` + `mailboxOAuthBanner`, so what is asserted is
the sentence the operator actually sees, not an intermediate code. And I
checked the page itself (`.../mailboxes/page.tsx:130`) rather than assuming: it
passes `reason` straight through with no allow-list, so the new code renders
without further wiring. As the brief predicted, the existing "never says
Microsoft for a Google mailbox" sweep picked up the new message for free once
the reason was added to `EMITTED_REASONS`.

## Gates

| Gate | Result |
|---|---|
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **2951 passed / 298 files** |
| `npm run build` | exit code 0 |

One honest note on the test run. The **first** full run showed 1 failure:
`sentry-config-wiring.test.ts` "hands Sentry a client that will not collect
prospect data", `Test timed out in 5000ms`. It passes alone in 398 ms and the
whole suite passed clean on re-run. It is in a file this cycle never touched,
and it is the flakiness class QUEUE row 35 already describes — a 5-second
default timeout under a loaded runner. Reporting it rather than quietly
re-running until green.

I also ran the shipped parser against the real QUEUE.md after editing it, since
an unreadable status cell stops the entire queue: **79 rows, 0 unparseable**,
and rows 50 / 52 / 66 / 73 / 74 all read back correctly.

## Three findings, queued not smuggled

### Row 52 — the row-51 fix is merged and correct and STILL NOT RUNNING

At start of cycle, `git status` showed `.bidlow/relay/log/cycle-063.md`
MODIFIED. The real 182-line log committed in `5f21d86` had been replaced on
disk by a 156-line stub beginning `# Cycle 63 - finished` / "Work happened."
**Cycle 63 fixed this bug, and the bug then ate cycle 63's own log.**

I restored it from HEAD before committing anything.

The explanation is not that the fix is wrong. The fix is on disk and correct:
`relay-watch.ps1:1831` calls `Write-CycleLog`, which appends, and `:1853` even
prints "nothing was overwritten". But the log was **truncated**, not appended
to. The only thing that explains a truncating write from a script that no
longer truncates is that **the running watcher process still holds the pre-fix
script in memory** — PowerShell parses a script once, at launch, and merging a
new `relay-watch.ps1` does nothing to an already-running instance.

So row 51 is DONE in the repository and inert in production. **The remaining
work is a process restart**, and until it happens every cycle log is still
being destroyed — including, in all likelihood, this one. I could not confirm
the watcher's start time directly: the process-table query was denied by the
sandbox. The inference stands on the truncation evidence alone, and is labelled
as an inference in the queue row.

This is instance eleven of the house defect and the nastiest variant so far:
not "never fired", but **"tested green, merged, and still not running"**, where
the deploy step for a local script is a restart nobody performs.

### Row 73 — QUEUE.md has a shadow second table

There are two tables. The live one is headed at line 191; a second, header-less
block sits at roughly lines 352-377 under the `## Rules for both sides` prose,
and it is a renumbered mirror. Rows 37-42 appear in both, and the same items
reappear as 53-72. My own item was **row 50 in one table and row 66 in the
other**. The Sentry item shipped as #312 is `DONE` as row 60 and still `TODO`
as row 69; the log-overwrite item shipped as #313 is `DONE` as row 51 and still
`TODO` as row 67.

This is the two-row-46 problem of row 49 at twenty times the scale. I marked
only my own pair (50 and 66) and left the rest deliberately — adjudicating
other cycles' work from a one-line summary, in a file two writers edit
concurrently, is how this gets worse rather than better.

### Row 74 — Connect deletes a working credential before sign-in

`prepareMailboxOAuthConnection` opens its transaction with
`mailboxIdentitySecret.deleteMany(...)` and sets `PENDING_CONNECTION`,
`providerLinkedUserId: null`, `connectedAt: null` — **all before the browser is
redirected to the provider.** One click on Connect against a healthy CONNECTED
mailbox destroys its refresh token immediately. Abandon the flow and that
mailbox cannot send until someone completes a full reconnect. Nothing warns
anyone; the row just reads "Pending connection".

**My change makes this sharper, and I am disclosing that rather than burying
it.** Before today, an abandoned link could still be completed hours later and
would restore the mailbox. Now it expires after 15 minutes and the only route
back is pressing Connect again. The new banner says exactly that, which is the
mitigation — but it only reaches the person who returns to the callback, not
the one who never comes back. On balance the expiry is still right: an
indefinitely-live token to avoid an operator having to click Connect twice is
the wrong trade. But it is a real interaction and it belongs in the record.

The queue row also asks the next cycle to check whether any live mailbox is
sitting in `PENDING_CONNECTION` with no secret right now, because that would be
a client-visible outage already in progress and would outrank the code change.

## Scope

No schema change — the column has existed since April. No migration, no cron,
no send-path change, no email sent, no client data touched. None of the three
things that stop and ask were in play.

## Open questions: 1

Should the watcher re-read its own script, or stamp its loaded version into
each cycle brief so a stale instance is visible? Restarting it fixes today;
neither option prevents the next silent staleness, and choosing between them is
a design call I did not want to make inside a security row.
