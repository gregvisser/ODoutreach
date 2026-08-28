# Supervision note - 2026-08-26 19:40 UTC

Written by the Cowork half of the relay, not by a cycle. Greg has not read it.

## The relay was healthy but idle, and the reason was a formatting fault

STATUS.json said cycle 18 `finished` at 20:11 local (19:11 UTC), 13 minutes
before this check. No HALT file. Nothing was hung. But no NEXT.md existed and
SELF-QUEUE-NOTE.md said the relay had refused to take the next item because it
had an unrecognised status beginning `20-lts`.

That status does not exist. Item 31's status is `DONE 18`. What happened is
this: `Get-QueueRows` in `relay-watch.ps1` splits each row on the pipe
character and reads the status as the second-to-last field. Item 31's status
text quoted an Azure runtime string that itself contained a pipe, so that row
had five pipes instead of four, the index landed one field early, and the
watcher read a fragment of the prose as the status. It then idled for the
evening with a green queue behind it.

Two more landmines were found in the same pass:

* Item 27's status began `PARTIAL 17`. The watcher only takes `TODO`, so it
  would have stalled on that row next even after the pipe was fixed.
* The watcher's blocked-item check is a substring match, and item 27's status
  contained the words "blocked on tooling" and "mergeStateStatus is now
  BLOCKED" in ordinary prose. It would have been refused as a blocked item.

All three are corrected in QUEUE.md. Every row now has exactly four pipes, and
a simulation of the watcher's own selection logic confirms it will now take
item 27. A new item 32 has been added to fix the parser properly, because
correcting the data does not stop this recurring.

## Cycle 18 did real work, and it verifies

Checked against git and the files on disk, not against the cycle's own claims:

* `11a9a93` is on `main` with the seven files it claims.
* `prefetch={false}` is genuinely present in `app-sidebar.tsx` and
  `client-workspace-subnav.tsx` on main.
* `panel-action-outcome.ts` exists, and `family-proposal-panel.tsx` genuinely
  imports it, holds an `isError` state and renders a "Try again" control.

This is not one of the six. The work is real.

## The finding that matters most: PR #247 is still not merged

Item 27's defects (1), (2) and (4) - the install banner covering live data on
/reporting, the Campaigns column reading 0 for all 17 clients, and the client
workspace showing the same seven destinations three times - were built, and
cycle 17 recorded them as green and ready to merge. They are not live.

Verified: branch `fix/ux-install-banner-and-campaigns-column` is pushed, is 5
commits ahead of `origin/main`, is contained in no other branch, and contains
no Prisma migration. The repository's working tree is still parked on that
branch. Those are client-visible fixes sitting in an unmerged PR.

## A correction to cycle 18's own reasoning, worth acting on

Cycle 18 recorded the after-measurement of the prefetch fix as owed and
unobtainable, "can't drive an authenticated browser from here", and left it for
a person with a browser. That is not right. This repository already drives an
authenticated browser: `e2e/global-setup.ts` and `e2e/screen-walk.spec.ts` sign
in and walk the app, and that suite runs as a required check on every PR. The
owed measurement can be a test rather than a favour asked of somebody.

Cycle 19 has been queued to do exactly that.

## Nothing here needs Greg

The two decisions cycle 18 reserved for him are still open and still correctly
reserved: scaling the B1 App Service plan is recurring money on the client's
subscription, and toggling Always On restarts the live app. Neither is urgent
enough to interrupt him for, and neither is blocking the queue.

## One hazard I created and cleared, recorded so it is not a mystery later

Running `git status` from the Cowork side of the relay leaves a stale
`.git/index.lock` behind, because that bridge cannot unlink files. It was
moved aside to `.git/index.lock.stale-cowork` immediately, and `.git` is clean
again - but that file can be deleted, it serves no purpose. The relay's own
cycles run git natively on Windows and are not affected. Future supervision
passes from this side should avoid `git status` and use read-only commands.
