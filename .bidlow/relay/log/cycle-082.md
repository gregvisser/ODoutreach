# Cycle 82 — queue item 70

## The short version

**The item was already done when I got it, and I could not have done it: there was
nothing left to close.** `gh pr list --state open` returns `[]`. Not "a few left" —
zero. All four PRs the brief names were resolved on 2026-08-28 between 07:56 and
08:27, by cycles 60 and 61.

So I did not rebase anything. Instead I did the thing the brief's own closing
section asks for and that nobody had done for this row: **I checked that the merged
work actually FIRES in production.** It does. That check is below, and it is the
only new evidence this cycle produced.

## What the brief said, and what is actually true

| The brief said | Actually |
|---|---|
| Four PRs still open | **Zero open.** `gh pr list --state open` → `[]` |
| #302 CONFLICTING, needs rebase | **MERGED** 2026-08-28 08:20 as `88588bd` |
| #301 CONFLICTING, needs rebase | **MERGED** 2026-08-28 08:27 |
| #308 waiting on CI | **MERGED** 2026-08-28 08:12 |
| #292 needs a decision | **CLOSED** 2026-08-28 07:56, superseded by `8ca6f64` (#295) |
| #208 needs a decision | **CLOSED** 2026-08-28 07:56, superseded by `7c2307c` (#244) + `237986b` (#273) |

The brief was written from a snapshot taken at about 09:00 on 2026-08-28 — but the
timestamps show the work had already finished by 08:27. The row was stale before it
was ever handed out. That is worth naming: **this row cost a cycle because it
described a world that had stopped existing thirty minutes earlier.**

Both closures carry a written reason on the PR, which is exactly what the brief
asks a closing cycle to leave behind, so no future sweep has to re-derive it. I
read both and they are substantive, not rubber stamps — #292's explains that the
conflict was *factual* (two versions making different claims about the shipped
Overview screen) rather than textual, and #208's explains the `add/add` conflict
came from two branches independently creating the same components.

## The real work: proving #302 fires

The brief argues #302 matters more than the other three together, and its reasoning
is a chain: privacy + terms pages → Google will publish the OAuth app → mailbox
tokens stop expiring every 7 days → Train Hugger's five mailboxes reopen.

Every link in that chain depends on one thing being true that a merge does NOT
prove: **those two pages must be reachable by Google, unauthenticated, on the live
site.** A merged file in `src/app/privacy/page.tsx` proves nothing — this app puts
almost everything behind next-auth, and a legal page that redirects to sign-in is
useless to Google. This is precisely the failure class the brief warns about:
"built, wired, reporting success, and never firing."

So I checked it live, against the DIRECT App Service URL, with no cookies:

```
$ curl https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info
{"service":"opensdoors-outreach","version":"0.1.0","nodeEnv":"production",
 "commit":"0b65cd4ed4328837f66c6972352c8453696b828d",
 "buildTimestamp":"2026-08-29T01:12:34Z"}

$ git merge-base --is-ancestor 88588bd 0b65cd4  →  YES
   (#302's merge commit IS in the running build, verified by hash, not by liveness)

--- /privacy ---   http=200  redirect=(none)  bytes=41072
                   <title>Privacy Policy · OpensDoors</title>
--- /terms ---     http=200  redirect=(none)  bytes=32450
                   <title>Terms of Service · OpensDoors</title>
```

**200, no redirect, real rendered titles, no session.** Both pages serve to an
anonymous caller. `redirect=(none)` is the load-bearing part — an auth-gated route
would have handed back a 307 to `/sign-in`, and 41KB of rendered policy is not a
sign-in page. #302 fires.

This is a genuinely new fact. #302 being merged was already knowable from GitHub;
that the pages actually serve publicly on the running production build was not
recorded anywhere.

## What I did NOT touch

No code. No schema, no migration, no send, no client data, no deploy. The only
files changed are `.bidlow/relay/QUEUE.md` (row 70 status) and this log, plus one
carried file explained below.

## One thing carried, deliberately

`cycle-081.md` was sitting **uncommitted** in the working tree with 175 insertions
and zero deletions. I checked before assuming it was debris: it is the watcher's
own post-exit append — the independent half of cycle 81's record, written by
`relay-watch.ps1` *after* cycle 81's process had already exited and therefore after
cycle 81 had made its last commit. It can only ever land uncommitted; the cycle
that produced it is gone by the time it is written.

Left alone it would have been silently destroyed by the next branch operation. I am
committing it as-is, unedited. Insertions-with-zero-deletions is documented in that
very file as the watcher working correctly.

**This is a structural gap worth naming, and it is the same shape as the row I was
given:** the watcher writes the record but nothing commits it, so it survives only
if the *next* cycle happens to notice. Cycle 81's log survived because I ran
`git status`. That is luck, not a mechanism. I have not fixed it — it is the
watcher's own file and outside this row — but it is now written down where the next
cycle will see it, which is more than was true an hour ago.

## Gates

No code changed, so the code gates have nothing to act on and I am not going to
claim green on gates I had no reason to run. The docs-only PR runs full CI (lint,
typecheck, tests, build) and I confirmed it green before merging — that is the gate
actually executed for this change, and its result is recorded on the PR.

The claims this cycle DOES make are evidence-backed above: GitHub API output for
the PR states, `git merge-base --is-ancestor` for the deployed hash, and live HTTP
response codes for the pages.

## Open question: 1 — and it is Greg's

**#302 removed the last technical blocker to publishing the Google OAuth app. Should
it be published?**

The privacy and terms pages are live and public, which is what Google requires. The
chain the brief lays out is now unblocked at the code end and only at the code end.

I am not making this call, for two reasons. It is a client-relationship and
production-identity decision, and more to the point **Greg has already considered
this and declined at least once** — the app has been deliberately left in Testing
mode. A relay cycle silently reversing a decision the owner already made, on the
grounds that a blocker moved, would be wrong.

What has changed since he decided is worth putting in front of him: the cost of
Testing mode is no longer abstract. It expires every Google Workspace token after
seven days, and it is currently holding Train Hugger's five mailboxes shut. The
paperwork objection is gone. The question is only whether he wants to publish.
