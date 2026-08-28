# Cycle 72 - queue row 49, the open-tracking pixel that lived behind the login

## In one sentence a non-coder can check

A hidden tracking image requested by someone who is not logged in used to come
back as a login page; it now comes back as a real 42-byte image - proved by two
tests that were watched failing first, and by a real request against the running
production build.

## The row number, because I was told not to trust the brief's

The brief warned that cycle 71 was renumbering rows while the brief was being
written, and told me to find this item by its content rather than its number.

I did. The row whose text begins **"INSTANCE EIGHT OF THE HOUSE DEFECT"** is
**still row 49** - line 262 of QUEUE.md - and it was still `TODO` when I took it.
Cycle 71's merge did not move it. The brief's number was right; I checked rather
than assumed.

QUEUE.md parses cleanly and is not damaged: 236,441 bytes, one table, and every
row I read had a status cell beginning with one of the six words.

## The pull request sweep

`gh pr list --state open` returned **nothing**. Zero open PRs, for the fourth
cycle running. Nothing rotting.

## The brief was wrong about cycle 70's log, and I am saying so rather than working around it

The brief opened with a rescue instruction:

> `.bidlow/relay/log/cycle-070.md` **on disk is the 155-line watcher stub**. The
> real 129-line log survives only on `main`, in `3b0363c`. Restore it before you
> `git add` anything.

**That was already done.** On disk, `cycle-070.md` is 129 lines, contains the
heading `## What I found before writing any code`, and `git diff main` against it
is **empty**. `git status` did not list it as modified at all. Cycle 71 had
already restored it - its own log says so.

Had I followed the instruction literally it would have been a harmless no-op, but
the reasoning matters: **a blind `git checkout` is exactly how cycle 70 destroyed
cycle 69's log** and had to undo it. The instruction to restore blind is the same
shape as the accident it exists to prevent. I have written that into row 52 and
into `RESTART-REQUIRED.md` as a standing rule: diff first, restore only what is
actually damaged.

What `git status` DID show was `cycle-071.md` modified - six lines appended by
the watcher saying cycle 71 "was still marked 'running'" and was stopped
part-way. That is an addition, not an overwrite, and it is true, so I kept it and
committed it.

## Measurement first. I did not assume the cause.

The brief insisted on measuring before changing a line, because two neighbouring
rows have gone stale this week and one cost two cycles. Both measurements, as
numbers:

**1. The endpoint, over real HTTP, no session, against a local production build**
(`npm run build` then `npm run start`, curl):

    HTTP/1.1 307 Temporary Redirect
    location: /sign-in?callbackUrl=%2Fapi%2Ftrack%2Fopen%2Fabc123

That reproduces row 49's recorded measurement character for character. The row is
live and was not stale.

**2. The middleware matcher**, read rather than taken on trust
(`src/middleware.ts:26`):

    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"

The row's description of the rule is accurate: the only extension-based escape is
a path **ending** in an image extension. `/api/track/open/<cuid>` ends in a cuid,
so the matcher catches it, and `isPublicPath()` did not list `/api/track/`, so
auth redirected it. Confirmed, with the actual regex quoted, not the word
"confirmed".

## The stale half of the row, which is the reason this was safe to do without Greg

Row 49 ended by telling me to "decide deliberately whether opens SHOULD resume,
since `OPEN_TRACKING_PIXEL` defaults ON and OpensDoors were told in writing that
open tracking is off."

I read `src/lib/tracking/client-open-tracking.ts` to check that for myself, as
instructed, and **that decision no longer exists.** The global environment switch
has been replaced by a per-client opt-in. `decideClientOpenTracking` refuses in
this order:

* `GLOBAL_KILL_SWITCH` - the env var, now only a backstop;
* `CLIENT_NOT_OPTED_IN` - **`openTrackingEnabledAt == null`, the default**;
* `LINK_DOMAIN_NOT_VERIFIED` - re-checked at send time, not just at opt-in;
* `EMAIL_AUTH_NOT_VERIFIED` - **`trackingDnsVerifiedAt == null`, the default**;
* `EMAIL_AUTH_STALE` - verified, but more than 7 days ago.

Two independent columns, both null by default, both required. So **making the
route reachable turns tracking on for nobody.** The written promise to OpensDoors
is kept by construction now, not by this bug. I verified it rather than taking
the brief's word for it, and it held.

## The fix: one line

`src/lib/public-paths.ts`:

    if (pathname.startsWith("/api/track/")) return true;

**A prefix rather than the exact path**, because the correlation id is *in* the
path - there is no fixed string to match, and a future `/api/track/click/<token>`
rail would be unreachable for precisely the same reason. **Scoped no wider than
that**: everything under `/api/track/` is by definition addressed to a recipient
rather than to a staff session, and the rest of `/api/` stays protected - proved
by the control test below still returning 307.

## Red first, both of them, watched failing

**Unit** (`src/middleware.test.ts`), before the fix:

    FAIL  src/middleware.test.ts > isPublicPath > allows the open-tracking pixel...
    AssertionError: expected false to be true
    - Expected   true
    + Received   false

**Over real HTTP** (new `e2e/open-pixel-public.spec.ts`), before the fix:

    ✘  returns a 200 image/gif with no session (47ms)
       Error: expect(received).toBe(expected)
       Expected: 200
       Received: 307
    ✓  control: a protected route fetched the same way is not 200

The control passed while the assertion failed - which is the point of it. It
proves the method can tell a public route from a protected one, so the spec
cannot later pass because middleware was bypassed wholesale.

I put the e2e spec in its own file, not in `e2e/legal-pages.spec.ts`, which
belongs to row 45.

## Green after, and the proof it is a real image

    status=200 content_type=image/gif size=42

    00000000: 4749 4638 3961 0100 0100 8000 0000 0000  GIF89a..........
    00000020: 0100 0100 0002 0144 003b                 .......D.;

`GIF89a` header, `0x3b` terminator - a complete, valid GIF, not a truncated body
with an optimistic content-type. The control, re-measured after the fix, still
returns **307**, so the middleware is still doing its job for everything else.

Both e2e specs together, pixel and legal pages: **6 passed**.

## A small correction to the row's own words

It is a **42-byte** GIF, not 43. The row says 43 and so does the route's own
comment (`route.ts:15`). `Buffer.from(...,'base64').length` is 42 and the wire
`content-length` is 42. I left the route file alone - it was explicitly out of
scope - so the comment is still one byte optimistic. It is cosmetic and I am
recording it rather than silently fixing a file I was told not to touch.

## Gates, run, not assumed

| Gate | Result |
|---|---|
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **3052 passed**, 309 files |
| `npx playwright test` (pixel + legal) | 6 passed |

One incident worth recording: the e2e run first died with
`The column Client.accountGrade does not exist`. The throwaway e2e database on
:5434 was four migrations behind. `npm run db:migrate:e2e` applied them. That is
the disposable container, **not client data** - no production database was
touched at any point this cycle.

## Assume the seventh exists: closed on production, not on a green test

The brief was explicit that this row IS an instance of the house defect, so a
green suite does not close it. Merged as **`f290136`**, deploy run `33208891088`
green including its post-deploy health check.

**Identity checked by hash first**, against the DIRECT App Service URL, never the
CDN-cached custom domain:

    GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info
    {"commit":"f290136ddc8ad8dd67c61499fa9f6789644a8816",
     "buildTimestamp":"2026-08-28T20:36:24Z"}

That is the commit I merged, so what answered next is genuinely this code and not
the previous build still being served.

**The real request, no session, no cookie:**

    GET /api/track/open/cycle72-reachability-probe
    status=200 content_type=image/gif size=42

    HTTP/1.1 200 OK
    Content-Length: 42
    Content-Type: image/gif
    Cache-Control: no-store, no-cache, must-revalidate, private

    00000000: 4749 4638 3961 ...  GIF89a
    00000020: 0100 0100 0002 0144 003b   -> terminator 0x3b

**The control, on production, fetched identically:**

    GET /dashboard  ->  status=307

So the pixel is public and the app is still protected. Both numbers on the
deployed commit, quoted rather than described.

## The honest limit, which I will not round up

**Proving the endpoint is reachable is NOT proving an open was recorded.**

No client is opted in. `openTrackingEnabledAt` and `trackingDnsVerifiedAt` are
null everywhere, so no outgoing mail carries a pixel, and nothing has been sent.
`openedAt` is therefore still written for nobody - correctly. What this cycle
changed is that the rail now exists and answers; whether any traffic ever runs on
it is Greg's decision and I did not touch it.

The e2e assertion deliberately uses a token that matches no row, so it also
confirms the route's documented behaviour on an unknown id: it returns the same
GIF, writes nothing (`updateMany` with `openedAt: null` matches zero rows), and
leaks nothing about whether the id exists. That claim in the row is accurate.

## What I did not touch

No schema, no migration, nothing in a send path, and no email was sent. I did not
edit `client-open-tracking.ts`, `open-pixel.ts`, or
`src/app/api/track/open/[token]/route.ts`. I did not set
`openTrackingEnabledAt` or `trackingDnsVerifiedAt` on any row or change their
defaults. I did not re-run cycle 71's table merge, and row 48 is still `BLOCKED 70`
at the foot of the table where it belongs.

Files changed: `src/lib/public-paths.ts`, `src/middleware.test.ts`,
`e2e/open-pixel-public.spec.ts` (new). Exactly the three the brief named, and no
fourth was needed.

## The side item: why the cycle logs keep dying, now measured

The brief asked me to write the missing measurement into row 52. I verified it
before writing it:

    git show -s --date=iso-strict 3d7fef6  ->  2026-08-28T10:12:54+01:00
                                           =   09:12:54 UTC
    git log -S "Write-CycleLog" -- relay-watch.ps1  ->  3d7fef6, and nothing else

The only restart there has been was at **07:26 UTC**. The fix landed at
**09:12 UTC** - one hour forty-six minutes later - and it is the *only* commit
that ever introduced the appending writer. PowerShell reads a script once at
launch, so **the running watcher has never held the fixed script.** A second
restart is the whole remaining fix and only Greg can do it (`relay-start.cmd`).

`.bidlow/relay/RESTART-REQUIRED.md` ended with "No restart is outstanding", which
was true of the three fixes it was written about and is now actively misleading
about this one. I reopened it with the measurement above rather than editing the
old note away - the original resolution is still true of what it covered.

## Open questions: 2

1. **Should any client be opted into open tracking?** The rail works now. Nobody
   is on it. Turning it on for a client needs their DNS verified first and is
   deliberately yours, not mine.
2. **The second watcher restart.** Only you can run `relay-start.cmd`. Until you
   do, every cycle keeps hand-rescuing its predecessor's log.
