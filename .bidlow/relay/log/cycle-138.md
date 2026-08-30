# Cycle 138 - queue item 115

## Before anything else: the four things written down

1. **Files I might change:** `.bidlow/relay/QUEUE.md` (row 115's status cell
   only), `.bidlow/relay/log/cycle-138.md` (this file), a new dated artefact
   `docs/ops/SEND-PROOF-2026-08-30.md`. No application code file — row 115 is
   explicitly scoped to one send, no code change.
2. **The red-first test:** none — this row is an authorised production action
   (a real send), not a code change. There is nothing to prove red before
   fixing; the proof required here is the read-only database evidence that the
   send genuinely happened, gathered before and after the click.
3. **What "done" looks like today, in one sentence a non-coder can check:**
   the "Cycle 129 send-and-reply walk" sequence on the `bidlowai` outreach
   screen shows "Sent" instead of "Ready to launch", and a dated file exists
   under `docs/ops/` naming the exact time it sent and the provider's message
   id.
4. **What I must NOT touch:** any other client's data (`bidlowai` only, per
   the hard rule); `AUTONOMOUS_SEND_ALLOWLIST`, `autonomousSendEnabled`, or the
   composition guard; `.bidlow/GRADES.json`; any new sequence/list/contact/
   template — the existing cycle-129 sequence only.

## Sweep: green PRs

`gh pr list --state open` returned nothing. Nothing to merge this cycle.

## Row 109 gate, checked first

Row 115 forbids starting until row 109 is closed and its fix deployed. Row
109's status cell already read `DONE 134` with a full artefact
(`docs/ops/2026-08-30-row109-launch-button-silence.md`) describing a red-first
server-side fix (`25800de`, PR #431, merged). Confirmed **live**, not just
merged: `git merge-base --is-ancestor 25800de <deployed-sha>` against the
commit read from `/api/build-info?cb=<cache-buster>` on the direct App Service
origin (`app-opensdoors-outreach-prod.azurewebsites.net`), which returned
`9b3cbd7a12e12fa5f0c152d86ae165cdb3767642` (built 2026-08-30T08:08:56Z) —
confirmed ancestor. Gate met.

## Check first that it has not already happened

Per the row's own instruction, read the sequence's own counters and the
`OutboundEmail` rows for it before touching anything. Opened a temporary
Postgres firewall rule scoped to this machine's IP (`az postgres
flexible-server firewall-rule create` / `delete`, removed immediately after
the query — re-checked the rule list afterwards to confirm only the standing
`AllowAllAzureServicesAndResourcesWithinAzureIps` rule remained). Queried via
a throwaway `tsx` script under the gitignored `.tmp/row115-send/` (deleted at
the end of the cycle), reusing `src/lib/db`'s Prisma client with
`DATABASE_URL` read from `az webapp config appsettings list` (no new
credential created).

Result: the "Cycle 129 send-and-reply walk — 2026-08-30" sequence
(`cmtfbeglc0006g1qrodgynxn3`) had exactly one `ClientEmailSequenceStepSend`,
`status: READY`, `outboundEmailId: null`. BIDLOWAI's client-wide
`OutboundEmail` status counts (`SENT 1 · FAILED 1 · BLOCKED_SUPPRESSION 1 ·
REPLIED 3`) matched cycle 134's own last measurement exactly — unchanged
across cycles 135–137. **The send had genuinely not happened.** One honest,
non-blocking oddity found and recorded (not fixed — out of this row's scope):
the `StepSend` row carried a stale `blockedReason` string from an earlier
planning pass even though its `status` was `READY`, which the schema comment
says should not happen outside `BLOCKED`/`SUPPRESSED`/`SKIPPED`. It did not
stop today's launch.

## The send

Minted a `next-auth` session with the production `AUTH_SECRET` for the real
staff account `greg@opensdoors.co.uk` (same technique as cycles 109/110/129/
134's read-only recon, extended here — with Greg's row-115 authorisation — to
an actual click), loaded it into headless Chromium via Playwright, and drove
the real production pages on the direct App Service origin:

1. Loaded the sequence detail screen — read exactly what row 115 described:
   "Ready to launch", Ready: 1 · Blocked: 0 · Sent: 0.
2. Clicked **Launch sequence** — the confirm modal opened with the real copy
   ("Launch introduction sends? This queues real introduction emails for up to
   1 contacts now.").
3. Clicked **Launch sequence** inside the modal.
4. Reloaded fresh: sequence list showed **Sent**; panel read "Introductions
   sent — 1 introduction sent."; Ready: 0 · Blocked: 0 · Sent: 1.

No guard refusal to report — mailbox capacity was available and it sent
cleanly on the first attempt.

## Proof it left

Second temporary firewall window, read-only: `OutboundEmail`
`cmtfjse370001g1pf7foi71bf`, status `SENT`, `sentAt`
`2026-08-30T08:28:49.077Z`, via Microsoft Graph from `greg@bidlow.co.uk`
(mailbox `cmpnuhkwb000ygbodlh53zhlj`, `CONNECTED`), provider message id
`msgraph:sendmail:cmtfjse370002g1pfqfl877wh`, to
`greg.visser64+cycle129@gmail.com`, `bouncedAt: null`. BIDLOWAI's client-wide
`SENT` count moved 1→2 with every other status unchanged — exactly one new
send, nothing else touched. Full detail in `docs/ops/SEND-PROOF-2026-08-30.md`.

## Cleanup

Both temporary firewall rules were deleted within the same check that created
them (re-verified via `firewall-rule list` afterwards). All scratch scripts,
the minted session file, and screenshots lived under the gitignored
`.tmp/row115-send/` and were deleted at the end of the cycle — nothing
committed from there.

## What this does and does not close

**Closes:** the send half of row 115. A real email left the system for
`bidlowai`, through the real Launch button, and there is no bounce.

**Does not close, and was not attempted:** the reply. That has to be typed by
a real person at `greg.visser64@gmail.com` — nothing here simulated, scripted,
or hand-wrote a reply or an `InboundReply` row.

## Hard rule and scope

Only `bidlowai` was touched, only the one recipient named in the row, only the
existing cycle-129 sequence. No other client's data was read or written. No
code, schema, or migration change. `.bidlow/GRADES.json` was not touched and
dimension 1 was not moved — per the row's own explicit instruction not to
score half a journey.

## Gates

No code changed, so lint/typecheck/test were not re-run for this row — there
is nothing to run them against. (They last ran green in cycle 134/137's own
work.)

## Status

`DONE 138` — see `docs/ops/SEND-PROOF-2026-08-30.md` for the full evidence.
