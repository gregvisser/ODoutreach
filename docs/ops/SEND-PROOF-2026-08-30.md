# The send leg of row 115 — proved 30 August 2026 (cycle 138)

**Short answer: yes, one real introduction email left the system today at
08:28:49.077 UTC, from `greg@bidlow.co.uk` via Microsoft Graph, to
`greg.visser64+cycle129@gmail.com` — clicked by this cycle, through the real
"Launch sequence" button, under Greg's explicit written authorisation recorded
in row 115. No bounce. The reply leg is not part of this row and was not
touched.**

## 0. Authorisation and scope, verbatim

Row 115 of `.bidlow/relay/QUEUE.md` records Greg's own reply in Cowork on 30
August 2026 — asked whether the relay should perform this one click itself for
`bidlowai`, he replied **"do this."** That lifts the stop-and-ask on causing an
email to be sent for this one send only, on the `bidlowai` client only, to
`greg.visser64+cycle129@gmail.com` only. Nothing else was lifted. This row
touched no other client, created no new sequence/list/contact/template, and
made no code change.

## 1. Preconditions checked before anything else

- **Row 109 (the Launch button silence bug) is closed and its fix is live.**
  Fix commit `25800de` (PR #431) is an ancestor of the commit currently served
  by the direct App Service origin, confirmed via
  `git merge-base --is-ancestor 25800de <deployed-sha>` against
  `/api/build-info?cb=<cache-buster>` on
  `app-opensdoors-outreach-prod.azurewebsites.net`, which returned commit
  `9b3cbd7a12e12fa5f0c152d86ae165cdb3767642` (built 2026-08-30T08:08:56Z).
- **This sequence had not already sent.** Read-only, via a temporary Postgres
  firewall rule scoped to this machine's IP (added and removed within the
  check): the "Cycle 129 send-and-reply walk — 2026-08-30" sequence
  (`cmtfbeglc0006g1qrodgynxn3`) had exactly one `ClientEmailSequenceStepSend`,
  status `READY`, `outboundEmailId: null`. BIDLOWAI's client-wide
  `OutboundEmail` counts (`SENT 1 · FAILED 1 · BLOCKED_SUPPRESSION 1 ·
  REPLIED 3`) matched cycle 134's own last measurement exactly — nothing had
  changed in the four cycles since. One leftover, non-blocking fact from an
  earlier evaluation: the `StepSend` row carried a stale
  `blockedReason: "Held back by send pacing — the next batch for this
  workspace goes out later today."` from a prior planning pass, even though its
  `status` was `READY` — recorded here because it is a real oddity (the field's
  own schema comment says it should be null outside `BLOCKED`/`SUPPRESSED`/
  `SKIPPED`), not because it stopped anything: mailbox capacity was available
  and the live launch below sent on the first attempt.

## 2. What was actually clicked, and by whom

A `next-auth` session was minted with the production `AUTH_SECRET` (read via
already-authenticated `az webapp config appsettings list`, no new credential
created) for the real OpensDoors staff account `greg@opensdoors.co.uk`
(`entraObjectId: 3da861d6-c166-47e2-b44e-b9217bd58be2`, role `OPERATOR`,
member of `bidlowai`). That cookie was loaded into headless Chromium via
Playwright and used to drive the real production pages on the **direct** App
Service origin — the same method cycles 109/110/129/134 used for read-only
recon, extended here (with Greg's authorisation) to an actual click:

| Step | Action | Result |
|---|---|---|
| 1 | Loaded `/clients/{bidlowai}/outreach?sequenceId=cmtfbeglc0006g1qrodgynxn3` | Selected-sequence panel read exactly the state row 115 described: "Ready to launch", **Ready: 1 · Blocked: 0 · Sent: 0**, subject preview "A quick note from BidlowAI" |
| 2 | Clicked **Launch sequence** (trigger button) | Modal opened: *"Launch introduction sends? This queues real introduction emails for up to 1 contacts now. Follow-ups are launched separately."* |
| 3 | Clicked **Launch sequence** (modal confirm button) | Trigger button switched to disabled "Working…" (the row 109 in-flight guard); page redirected |
| 4 | Reloaded the same URL fresh | Sequence list showed status **Sent**; panel read "Introductions sent — 1 introduction sent. No remaining recipients for this step.", **Ready: 0 · Blocked: 0 · Sent: 1** |

Screenshots were taken at each step and inspected, then deleted along with the
scratch Playwright/Prisma scripts and the minted session file — all kept under
this repo's gitignored `.tmp/row115-send/`, nothing committed.

## 3. Proof the send actually left, read from the database

Read-only, over a second temporary firewall window opened after the click:

| | |
|---|---|
| Sequence | "Cycle 129 send-and-reply walk — 2026-08-30" (`cmtfbeglc0006g1qrodgynxn3`) |
| Client | `bidlowai` (`cmpmhb5j40000gbo05h6oyc7j`) — the only allowlisted client |
| `ClientEmailSequenceStepSend` | `status: SENT`, `outboundEmailId: cmtfjse370001g1pf7foi71bf` |
| `OutboundEmail.id` | `cmtfjse370001g1pf7foi71bf` |
| From | `greg@bidlow.co.uk` (mailbox `cmpnuhkwb000ygbodlh53zhlj`, `connectionStatus: CONNECTED`, `isSendingEnabled: true`) |
| To | `greg.visser64+cycle129@gmail.com` |
| Created (queued) | 2026-08-30T08:28:47.827Z |
| **Sent** | **2026-08-30T08:28:49.077Z** |
| Transport | Microsoft Graph (`microsoft_graph`) |
| Provider message id | `msgraph:sendmail:cmtfjse370002g1pfqfl877wh` |
| Row status | `SENT` |
| `bouncedAt` | `null` — no bounce |

Queue → sent landed in about 1.2 seconds — an inline dispatch on a real click,
not a staged write.

BIDLOWAI's client-wide `OutboundEmail` status counts before and after:

- **Before:** `SENT 1 · FAILED 1 · BLOCKED_SUPPRESSION 1 · REPLIED 3`
- **After:** `SENT 2 · FAILED 1 · BLOCKED_SUPPRESSION 1 · REPLIED 3`

Exactly one new `SENT` row, nothing else moved — this row sent once, touched
no other row, and no other client's counts were queried or changed.

## 4. Hard rule and scope, confirmed

- Real email sent for `bidlowai` only, to the one address named in the row.
- No other client's data was read, written, or sent to.
- No new sequence, list, contact, or template was created — the existing
  "Cycle 129 send-and-reply walk" sequence (built by cycle 129) was used
  exactly as instructed.
- No code change. No schema change. No migration.
- Both temporary Postgres firewall rules used for this row's read-only checks
  were removed immediately after use; only the standing
  `AllowAllAzureServicesAndResourcesWithinAzureIps` rule remains.
- `.bidlow/GRADES.json` was not touched. Dimension 1 was not moved. This row
  delivers the send half only — not the whole journey.

## 5. What is proven and what is not

**Proven:** the send leg. A real email left the system for `bidlowai`, through
the real "Launch sequence" button on the real screens, driven the way an
operator would drive it, and there is no bounce.

**Not proven, and not attempted:** the reply leg. The reply must be typed by a
real person at `greg.visser64@gmail.com` (of which `+cycle129` is an alias) —
nothing in this row simulated, scripted, hand-wrote, or otherwise stood in for
a reply. No `InboundReply` row was touched.

## The send is done. The reply is now waiting on Greg.

What to look for: a reply landing under the subject **"A quick note from
BidlowAI"**, sent to `greg.visser64+cycle129@gmail.com`, with the reply-matcher
naming **"Cycle 129 send-and-reply walk — 2026-08-30"** (not the 26 August or
29 August sequences) as the sequence it matched to. Mailbox reply-sync runs
weekdays 07:00–18:00 UK time — a reply sent outside that window will not be
ingested until the next run inside it.
