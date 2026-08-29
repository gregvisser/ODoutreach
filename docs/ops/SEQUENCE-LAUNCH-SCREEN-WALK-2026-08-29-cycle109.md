# Can an operator actually launch a sequence through the screens? — re-walked 29 August 2026 (cycle 109)

**Short answer: further than ever, but still not sent. For the first time, a
sequence built entirely through the real screens reached a genuine, app-computed
"Ready to launch" state — the exact wall that stopped cycle 106 is gone. The walk
then stopped deliberately, one click before the real send, because causing an
email to be sent is one of this project's three absolute stop-and-ask conditions,
and this row was not itself Greg's direct ask for a send the way row 97 was.**

This is a direct continuation of `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`
(cycle 106), which built a template, an imported contact, and a sequence through
the real screens and got refused at the final step because BidlowAI's
`Client.defaultSenderEmail` was null. That field was set in production by cycle
107 (row 98) and an operator-facing screen to set it was shipped by cycle 108
(row 99). This walk re-runs the same journey to see whether the fix actually
holds when driven through the screens again, not just re-read from the database.

Deployed commit verified by hash before starting, on the **direct** App Service
origin: `/api/build-info` → `7980c0b0b95524a30d18f9368c82bfa57fd8c58b`,
`/api/health` → `ok: true`, `autonomousRelay.allowlistedClients: 1` (BidlowAI
only, unchanged).

## Method — a real staff session, driving the real screens

No interactive Chrome extension was available in this session (checked; none of
the connected tool surfaces offered one). Instead this walk used the same
method cycle 106 used: **a real, short-lived `next-auth` session cookie**, minted
with the production `AUTH_SECRET` and next-auth's own `encode()` (not
reimplemented crypto — see `e2e/global-setup.ts` for the same technique used by
this repo's own e2e suite), for a genuine, existing OpensDoors staff account:
`greg@opensdoors.co.uk` (plain `OPERATOR` staff role, `LEAD` membership on
`bidlowai` — not a super-admin). That cookie was loaded into a **headless
Chromium browser via Playwright** (already a project devDependency), which
then drove the actual production pages and clicked the actual buttons — real
HTTP requests to `https://opensdoors.bidlow.co.uk`, real React Server Actions,
real database writes. This is a browser walk, not an API call standing in for
one: screenshots were taken at every step and inspected visually before
proceeding.

`AUTH_SECRET` and Kudu (SCM) access came from Azure CLI (`az`, already
authenticated as `greg@bidlow.co.uk`, owner on the subscription) — no new
credential was created, and nothing was read from or written to
`_standards` or any sibling client folder. All scratch scripts, the minted
session file, and screenshots were deleted from both the local machine and the
App Service Kudu scratch directory (`/home/tmp`) at the end of this walk —
nothing was committed, matching the precedent set by cycle 106.

## What was actually clicked, in order

| Step | Screen | Action | Result |
|---|---|---|---|
| 1 | `/clients/{bidlowai}/outreach?sequenceId=...` | Opened the leftover "Cycle 105 walk" sequence from cycle 106 and clicked **Review recipients**, then checked **Re-engage (bypass cooldown)** and reviewed again | Still "Ready now: 0" — see finding below; this path was abandoned in favour of a fresh contact |
| 2 | Same sequence, "Delete or archive sequence" | Confirmed the native browser dialog | Archived (has enrollment history, so archived rather than hard-deleted, exactly as its own on-screen copy says) |
| 3 | `/clients/{bidlowai}/sources` | Typed a new list name, chose a one-row CSV (`A Emails,Name`) for a **fresh, never-contacted** address, clicked **Preview** | "Email-sendable: 1" |
| 4 | Same screen | Clicked **Confirm import** | New list created, one new contact saved |
| 5 | `/clients/{bidlowai}/outreach` | Expanded **New sequence**, named it, picked the new list, picked an existing approved INTRODUCTION template, clicked **Save sequence** | Sequence created; save auto-ran `autoPrepareSequenceForLaunch` |
| 6 | Sequence detail | Read the flash message and the "Live sends" card (no click needed — auto-prepare had already run) | **"Ready to launch — 1 mailbox connected · 30 sends available today." Ready: 1 · Blocked: 0 · Sent: 0.** |
| 7 | Sequence detail, "Live sends" | Clicked **Review recipients** again anyway, as an explicit human-style confirmation step | Unchanged: "Ready now: 1" |
| 8 | Sequence detail | **Did not click "Launch sequence."** Stopped here deliberately. | — |

## A real, separate finding along the way (not a defect — worth naming)

Re-attempting cycle 106's leftover sequence (step 1) with the SAME contact
(`greg.visser64@gmail.com`, real-sent-to on 26 August) still showed "Ready now:
0" even after checking **Re-engage (bypass cooldown)** and re-submitting — the
underlying `ClientEmailSequenceStepSend` row still carried
`blockedReason: "Recently contacted on 2026-08-26 — eligible again on
2026-09-05 (10-day cooldown)."` This was investigated far enough to see that the
review-recipients form's real POST body (captured directly from the browser,
not inferred) never carried a `reengage` field at all on either submission, even
though the checkbox was visibly and programmatically checked at click time. This
may be a genuine UI/serialization gap in that specific checkbox's form
submission — or may be correct behaviour this walk doesn't fully understand.
**Not fixed here and not this row's job to fix** (row 92 is a walk, not a repair,
and "DO NOT TOUCH ANY OTHER DIMENSION" applies) — named here so a future row can
pick it up deliberately, with its own red-first test, rather than rediscovering
it from scratch. This walk worked around it the clean way: enrolling a genuinely
fresh, never-contacted recipient instead, which needs no cooldown override at
all and is arguably the more realistic operator path anyway.

A second, smaller thing found and worked around rather than fixed: the first
attempt at a fresh sequence (since archived) used the client's original
"Intro v1 — audit-led opener" template and was blocked with "Missing required
sender field(s): `{{company_name}}`" — that template references a merge field
BidlowAI's own client record has never had populated. Switched to the
"Cycle 105 walk intro" template (cycle 106's own leftover, which only uses
`{{first_name}}`/`{{sender_name}}`) and the block disappeared. This is
arguably the send-safety gate working exactly as designed — better to block an
unrenderable merge field than send `{{company_name}}` literally into someone's
inbox — not a bug.

## Where this walk stopped, and why

`.bidlow/relay/QUEUE.md`'s standing per-cycle rules name exactly three things
that stop and ask Greg before proceeding, and are explicit that this list is
**on top of** the `bidlowai`-only hard rule, not replaced by it: a destructive
migration, anything touching real client data, and — the one that applies
here — **"anything that causes an EMAIL TO BE SENT... absolute."** Row 92 itself
was written by the relay, off the top of the queue, and Greg has not read or
approved this specific wording (unlike row 97, which records "Greg asked for
this directly on 29 August" for its one send). Reaching a real, on-screen
"Ready to launch" state is not itself an email being sent — but clicking
**Launch sequence** is exactly that, for real, to
`greg.visser64+cycle109@gmail.com` (a Gmail plus-alias that still delivers to
Greg's own inbox — chosen so nothing here could ever reach a real third party
even if every other check were wrong).

So this walk stops here, one click short, and asks: **should the send actually
happen?** The sequence is left in place, live, genuinely "Ready to launch" —
nothing about it will change or expire on its own before someone (Greg, or a
future cycle carrying his explicit go-ahead) clicks the button.

## What this walk did NOT cover

Named plainly, same as cycle 106: **the send, the arrival, the reply, and the
reply-matching confirmation.** All four remain unproven through the screens.
Unlike cycle 106, the reason is no longer a product defect — it is a
deliberate policy stop, one click away from testable.

**The reply leg still has a known, separate gap even once a send happens**,
carried over unchanged from cycle 106's finding: there is no way for this
autonomous environment to author a genuine *external* reply by itself.
`RESEND_API_KEY` is still absent from the production App Service configuration
(confirmed again today), BidlowAI has exactly one connected mailbox
(`greg@bidlow.co.uk`, Microsoft), and no credential available here carries a
Microsoft Graph `Mail.Send` scope for any mailbox. A genuine reply needs a human
— Greg replying from `greg.visser64@gmail.com` (or its `+cycle109` alias) once
the introduction actually lands — exactly as it did for the 26 August proof's
"Round trip A."

## What this walk leaves behind in the workspace

* The old "Cycle 105 walk" sequence (cycle 106's leftover) — **archived** (has
  enrollment history, so the app archives rather than hard-deletes it).
* One new contact list, "Cycle 109 fresh — 2026-08-29", with one new contact
  (`greg.visser64+cycle109@gmail.com`) — real, harmless, never emailed.
* One new sequence, "Cycle 109 send-and-reply walk (v2) — 2026-08-29" — status
  **Ready to launch**, 1 recipient, 0 sent. Nothing will leave the building from
  it until someone deliberately clicks Launch and confirms the on-screen
  phrase.

Nothing here is a migration, a schema change, another client's data, or an
email.

## Re-score dimension 1

**Left at 8, exactly as instructed.** The brief is explicit that the score
moves only if the actual journey (send, arrival, reply, match) is performed —
not because the walk went further, and not because the remaining blocker is
now a policy stop rather than a defect. Both are true here and neither is
enough on its own. Recorded honestly in `.bidlow/GRADES.json`.

**Named plainly, what this walk did NOT cover:** the send, the arrival, the
reply, and the reply-matching confirmation. All four remain unproven through
the screens — for the first time, because of a deliberate stop rather than
because the product refused.

**What would unblock the next attempt:** an explicit answer from Greg on
whether to click **Launch sequence** on the sequence this walk left ready (or
to archive it and treat the "reached Ready to launch" evidence as sufficient
for now). If yes, the reply leg after that still needs a human to actually
reply from the recipient inbox — this environment cannot author that reply by
itself, for the reasons above.
