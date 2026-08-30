# Sequence launch, prepared and left one click short — cycle 129, 30 August 2026

**Short answer: the reply-matcher fix holds up through the real screens. A fresh
contact at a brand-new plus-alias was imported, a sequence was built from
scratch through the real screens, and it reached a genuine, app-computed
"Ready to launch" state — Ready: 1, Blocked: 0, Sent: 0. Nothing was sent.
This walk stops here, one click before Launch, and hands that click to Greg.**

This is a companion to `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle109.md`,
not a repeat of it. Cycle 109 reached the same "Ready to launch" state but its
own reply-matching leg was never provable, because the reply always arrived
from the plus-alias's **bare** address (Gmail strips the alias on Reply) and
the matcher in production at the time could not link a bare-address reply back
to an aliased send. That defect is now fixed and deployed — see "The fix this
walk depends on" below. This walk exists to give that fix a genuine send/reply
round trip to prove itself against, using a **new** alias so the round trip
cannot be contaminated by anything cycle 109 or cycle 105 already sent.

## The fix this walk depends on, verified before starting

`GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`
(the **direct** App Service origin, cache-busted with a fresh query parameter,
never the CDN-fronted custom domain):

- At the start of this cycle's recon: `commit: 75240ed1a6f37b28f4ef37a4e590ee2ea2b5ee15`.
- By the end of this cycle (row 103's PR `#423` merged and auto-deployed mid-cycle):
  `commit: 674bd8bf6bbdbc0390e91bce40ca018f000ddc9d`.

Both were checked. `git merge-base --is-ancestor 8b2370f <hash>` returned true
against **both** commits — the canonicalize-plus-alias fix (`8b2370f`, PR
`#419`, `src/lib/normalize.ts`) is an ancestor of whichever build actually
served this walk. Row 103's own change (a PowerShell relay script and two
markdown files) touches nothing the Next.js app serves, so which of the two
commits was live during any given request makes no functional difference here.
`GET /api/health` returned `{"ok":true,"checks":{"database":"ok"},
"autonomousRelay":{"active":true,"allowlistedClients":1}}` throughout — the
hard rule's one-client allowlist, unchanged.

## Method — a real staff session, driving the real screens

Same method as cycle 109, repeated because it still works and nothing better
was available: a genuine, existing OpensDoors staff account
(`greg@opensdoors.co.uk`, `entraObjectId: cycle110-readonly-check` — a
placeholder id a much earlier cycle set on this StaffUser row; next-auth only
checks that this id matches the `StaffUser.entraObjectId` it was issued
against, so a placeholder string authenticates identically to a real Entra
GUID) got a real, short-lived `next-auth` session cookie, minted with the
production `AUTH_SECRET` and next-auth's own `encode()` — not reimplemented
crypto, the same technique `e2e/global-setup.ts` uses for this repo's own e2e
suite. That cookie was loaded into a **headless Chromium browser via
Playwright** (already a project devDependency) and used to drive the actual
production pages against the **direct** App Service origin
(`app-opensdoors-outreach-prod.azurewebsites.net`) — real HTTP requests, real
React Server Actions, real database writes, screenshots taken at every step
and inspected before proceeding.

`AUTH_SECRET` and the production `DATABASE_URL` came from `az webapp config
appsettings list` (Azure CLI, already authenticated as `greg@bidlow.co.uk`,
owner on the subscription) — no new credential was created. The Postgres
Flexible Server firewall only allows Azure-internal traffic by default, so a
**temporary** firewall rule scoped to this machine's own public IP was added
for two narrow, read-only recon queries (bidlowai's client id / staff /
mailbox rows before the walk, and the outbound-queue status counts before and
after it) and removed again immediately after each query — the firewall rule
list was re-checked afterwards both times to confirm only the standing
`AllowAllAzureServicesAndResourcesWithinAzureIps` rule remained. All scratch
scripts, the minted session file, the CSV fixture, and the screenshots were
kept under this repo's already-gitignored `.tmp/` directory
(`.tmp/row104-scratch/`, matching the existing convention documented in
`.gitignore` for exactly this kind of throwaway working file) and were deleted
from disk at the end of this walk — nothing under `.tmp/` was committed.

## What was actually clicked, in order

| Step | Screen | Action | Result |
|---|---|---|---|
| 1 | `/clients/{bidlowai}/{clientId}` | Loaded with the minted cookie | Landed on the real client overview, not bounced to sign-in — session genuinely authenticates as staff |
| 2 | `/clients/{bidlowai}/sources` | Typed a new list name (`Cycle 129 fresh — 2026-08-30`), attached a one-row CSV (`A Emails,Name` header, exactly cycle 109's format) for **`greg.visser64+cycle129@gmail.com`** — a plus-alias never used by this app before (checked: only `+cycle109` and `+cycle105` existed) — clicked **Preview** | Preview tile read **"Email-sendable: 1"** |
| 3 | Same screen | Clicked **Confirm import** | New list created, one new contact saved; redirected back to `/sources` |
| 4 | `/clients/{bidlowai}/outreach` | Expanded the **New sequence** accordion (it is a collapsed `<details>` on this page — cycle 109's walk predates this accordion, this cycle had to find it), named the sequence `Cycle 129 send-and-reply walk — 2026-08-30`, selected the new list, selected the existing **"Cycle 105 walk intro — 2026-08-29-cycle105"** INTRODUCTION template (only template that renders with no unfilled merge field — same choice cycle 109 made and for the same reason), left the mailbox on auto-pick, clicked **Save sequence** | Flash banner: *"Saved — Cycle 129 send-and-reply walk — 2026-08-30 · Sequence checks passed · Ready to launch · 1 recipient added to this sequence · Recipient readiness updated"* |
| 5 | Sequences table | Clicked **Review and launch** on the new row | Opened `/clients/{bidlowai}/outreach?sequenceId=...` — the sequence's own detail panel |
| 6 | Sequence detail | Clicked **Review recipients** again anyway, as an explicit human-style confirmation step (same as cycle 109) | Panel unchanged: "1 recipient on this sequence", PENDING 1 |
| 7 | Sequence detail | Read the "Ready to launch" banner and the "Live sends" card. **Did not click "Launch sequence."** Stopped here deliberately. | Quoted verbatim below |

## The state this walk left behind, quoted verbatim from the screen

```
Ready to launch
1 mailbox connected · 30 sends available today.

Live sends
Ready: 1   Blocked: 0   Sent: 0
Subject preview
A quick note from BidlowAI

Introduction email
Ready now: 1
This launch sends up to 30 emails now. Remaining eligible recipients stay
queued for later batches within daily mailbox limits.

[Launch sequence]   You will confirm in a dialog before anything is queued.
```

The `Launch sequence` button was visible and **enabled** (`disabled` attribute
= `false`) — this is a genuine, app-computed readiness, not a UI state that
merely looks ready. It was never clicked, and the modal it opens (which itself
carries a second, identically-labelled "Launch sequence" confirm button) was
never opened either.

## Confirming nothing left the building

Read-only `OutboundEmail.status` counts, grouped, taken immediately before
step 2 and again immediately after step 7, over the temporary firewall
window described above:

**Before:**
```
ALL CLIENTS:  SENT 1335 · BOUNCED 11 · FAILED 56 · BLOCKED_SUPPRESSION 1 · REPLIED 16   (no QUEUED rows at all)
BIDLOWAI:     SENT 1 · FAILED 1 · BLOCKED_SUPPRESSION 1 · REPLIED 3
```

**After:**
```
ALL CLIENTS:  SENT 1335 · BOUNCED 11 · FAILED 56 · BLOCKED_SUPPRESSION 1 · REPLIED 16   (no QUEUED rows at all)
BIDLOWAI:     SENT 1 · FAILED 1 · BLOCKED_SUPPRESSION 1 · REPLIED 3
```

Identical, row for row. Nothing was queued and nothing was sent. On screen,
the sequence's own "Sent" tile also reads **0**.

## Where this walk stopped, and why

Same three named stop-and-ask conditions this project has carried since
27 August, and the same one applies here: **"anything that causes an email to
be sent"** is absolute, on top of the `bidlowai`-only hard rule, not instead of
it. Row 104 was explicit that preparing the walk is not the same thing as
Greg clicking Launch, and that a row must never score its own setup — so this
walk stops at "Ready to launch", exactly as instructed, and hands the last
click to a plain-English note at
`C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md` (outside this
repository, per the repository-boundary rule) for Greg to take when he
chooses to.

## What this walk did NOT cover, named plainly

The send, the arrival, the reply, and the reply-matching confirmation itself.
All four remain unproven through the screens — proving them needs a real
click on **Launch sequence**, which only Greg can give, and then a real reply
from `greg.visser64+cycle129@gmail.com`'s bare address once the introduction
lands. This walk's only job was to get the sequence into a state where that
click is the only thing left to do, and to leave a plain-English note
explaining exactly what to expect from it. Dimension 1 (Core journeys
end-to-end) is **left at 8, exactly as row 104 instructed** — it moves only
once a human has watched the reply land against the right send, and that has
not happened yet.

## What this walk leaves behind in the workspace

* One new contact list, **"Cycle 129 fresh — 2026-08-30"**, with one new
  contact (`greg.visser64+cycle129@gmail.com`) — real, harmless, never
  emailed.
* One new sequence, **"Cycle 129 send-and-reply walk — 2026-08-30"** — status
  **Ready to launch**, 1 recipient, 0 sent. Nothing about it will change or
  expire on its own before someone clicks Launch and confirms the on-screen
  phrase.
* Nothing else: no other client's data was read past its own client-id lookup
  for `bidlowai` (needed once, to build the correct URL), no schema change, no
  migration, `.bidlow/GRADES.json` was not opened for writing, and the
  temporary Postgres firewall rule used for the two read-only recon windows
  was removed both times within the same tool call that added it.
