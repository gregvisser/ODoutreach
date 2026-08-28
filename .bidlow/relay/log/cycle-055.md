# Cycle 55 — queue item 45: the privacy policy and terms pages

**Branch:** `feat/privacy-terms-pages` · **Commit:** `7819b10`
**Gates:** lint 0 · typecheck 0 · 2716 unit tests · 70 e2e passed / 1 skipped

## What the item was

Build `/privacy` and `/terms`, publicly reachable without a login, written from
what the code actually does, marked clearly as an unreviewed draft. Red-first: a
test that both routes return 200 without a session.

It is three blockers in one: CR-07 (customer-ready), the disabled Google OAuth
Publish button, and therefore Train Hugger's five unconnected mailboxes.

## What shipped

Two real pages plus a shared shell, a public-path allowance, and a footer.

| File | What |
|---|---|
| `src/app/privacy/page.tsx` | NEW — the policy |
| `src/app/terms/page.tsx` | NEW — the terms |
| `src/components/legal/legal-page-shell.tsx` | NEW — chrome, draft notice, the three unconfirmed constants in one place |
| `src/components/legal/legal-footer-links.tsx` | NEW — footer links |
| `src/lib/public-paths.ts` | +2 lines — `/privacy`, `/terms` |
| `src/middleware.test.ts` | red-first unit assertion |
| `e2e/legal-pages.spec.ts` | NEW — the 200-without-a-session proof + a control |
| `src/app/(app)/layout.tsx`, `src/app/sign-in/page.tsx` | footer mounted |

**The footer is mounted twice on purpose.** Inside the signed-in app shell, and
on the signed-out sign-in page. Only the second is reachable by Google's
reviewer or by a prospect. A footer that existed only behind the login would
have been invisible to the entire audience the pages were built for — which is
the exact "built, wired, reports success, never fires" shape this queue has now
recorded eight times. The brief said "linked from the app footer"; taken
literally that would have shipped the defect.

## Proving it fires

The brief said assume the seventh exists. So the pages were not asserted, they
were fetched.

Live, against the production build (`npm run build` + `npm run start`), no
session, no cookie:

```
/privacy                     200
/terms                       200
/api/track/open/abc123       307 -> /sign-in?callbackUrl=%2Fapi%2Ftrack%2Fopen%2Fabc123
/dashboard                   307 -> /sign-in?callbackUrl=%2Fdashboard
```

**Red-first, watched both ways.**

*Unit* — `src/middleware.test.ts` asserts both paths are public. Watched failing
before the change: `AssertionError: expected false to be true`.

*E2E* — `e2e/legal-pages.spec.ts` uses `request.get(path, { maxRedirects: 0 })`
so a sign-in bounce cannot become a 200 on the wrong page. Proved capable of
failing by **deleting the `/privacy` line from `public-paths.ts` and rebuilding**
— it went red naming the exact redirect
`http://localhost:3000/sign-in?callbackUrl=%2Fprivacy`, while `/terms` stayed
green. A clean A/B on the real code, not a claim. Working tree restored and
re-verified by `git diff` before committing.

A permanent **control test** asserts a protected route fetched the identical way
is *not* 200, so the spec cannot pass for the wrong reason if the middleware is
ever bypassed wholesale.

## What the pages say, and the one place the brief was wrong

Written from `.bidlow/BLUEPRINT.json` and the code, not a template. The
uncomfortable facts are stated rather than omitted:

* **No retention or deletion schedule at all.** Records are kept indefinitely
  and die only with a manual workspace purge.
* **ContactUniverse survives that purge.** It has no `clientId`, so purging the
  only workspace that ever knew a prospect leaves their name, email, phone and
  LinkedIn URL in place.
* **Suppression is per-client**, so unsubscribing from one client does not stop
  another.
* **Open tracking defaults ON** (`OPEN_TRACKING_PIXEL` undefined ⇒ enabled) and
  records a first-open timestamp only — no IP, no user agent, no location.

**Correction to the brief.** It states "suppression is append-only and checked
twice". Append-only is true of unsubscribe and bounce suppressions *only*.
BLUEPRINT.json records sheet-sourced suppression as **REPLACE-ON-SYNC** — delete
a row from a client's Google Sheet and that address becomes contactable again.
The page says so, and QUEUE row 45 has been corrected. Repeating the brief would
have put a false statement in a privacy policy, which is the one document where
that is worse than saying nothing.

**Added beyond the brief:** the Google API Services User Data Policy **Limited
Use disclosure** on both pages. OAuth verification requires it separately from
the pages merely existing, so the pages would have been built and the Publish
button would still have been blocked.

**Marked as draft, on screen.** A testid-anchored amber notice on both pages
names the three things awaiting a human, rather than burying them.

## Two findings that are not this cycle's work

Both are recorded as new QUEUE rows with evidence, and deliberately **not**
fixed here.

**Row 46 — instance eight, and it is live.** The open-tracking pixel endpoint
`/api/track/open/[token]` is behind the auth middleware. Measured, not inferred:
it returns 307 to `/sign-in` (see the table above). The matcher excludes only
paths *ending* in an image extension, and `isPublicPath()` does not list
`/api/track/`. So every recipient's mail client gets an HTML redirect instead of
the GIF, `openedAt` is never written, and every open rate in the product reads
0% for a reason unrelated to recipients. The route itself is careful and
correct — it is simply unreachable. Not fixed here because enabling it writes to
real client rows and changes reported numbers; and because
`OPEN_TRACKING_PIXEL` defaults ON while OpensDoors were told in writing that
open tracking is off. That promise and this defect currently agree *by
accident*. Fixing one without deciding the other breaks the promise.

**Row 47 — the grade gate is red in the working tree.** `.bidlow/GRADES.json`
was already modified-but-uncommitted at the start of this cycle, and
`src/lib/grade-record.test.ts` fails 4 tests on it:
`customer_ready.blockers.5: Unrecognized key: "closed_on"`. Proven pre-existing
and not mine: `git stash -u` → 10/10 green on clean HEAD; unstash → red again.
The rejected content is *good* (CR-05 now carries real signed-DPA evidence); the
zod schema just lacks an optional `closed_on`. **This cycle staged its eight
files by name and did not commit GRADES.json**, so CI sees a green tree — but
the next cycle that runs `git add -A` will push a red gate.

## Decisions taken rather than queued

* **Legal entity, controller/processor split, contact mailbox** — genuinely a
  human's call, so they are *not* silently invented. They sit in named constants
  in one file and are listed on screen in the draft notice as unconfirmed. The
  work shipped complete under a stated assumption instead of blocking on an
  answer.
* **CR-07 not marked closed.** The code gap it names is closed; a policy that
  announces itself as unreviewed is not yet the document a client asks for.
  Re-grade after sign-off.
* **Did not fix rows 46 or 47** despite row 46 being a one-line change in a file
  this cycle already edited. Different concern, different blast radius, needs its
  own red test.

## Stop-and-ask check

None of the three applies: no migration (no schema change at all), no client
data touched, nothing sent. Merged on green CI per the standing rule.

## Open questions for Greg — 3, and they are all one email

All three are on screen in the draft notice, and none blocked the build:

1. **What is the registered legal entity and address** that should appear on
   these pages?
2. **Who is the data controller** for prospect records — OpensDoors, or each
   customer, with OpensDoors as processor? This changes several sentences.
3. **Does `privacy@opensdoors.co.uk` exist and is it monitored?** Google's
   reviewer may write to it. If not, name one that does.

Worth knowing alongside them, because it affects what these pages unblock: the
Google app requests **`gmail.readonly`**, which is a **restricted** scope.
Publishing with it triggers Google's restricted-scope verification, which can
require a CASA security assessment with real cost and lead time. These pages
remove the blocker Greg actually hit; they do not guarantee the publish is a
five-minute job.
