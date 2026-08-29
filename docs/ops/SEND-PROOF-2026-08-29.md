# The send leg of row 92 — proved 29 August 2026 (cycle 111)

**Short answer: yes, a real introduction email left the system today at
22:45:54 UTC, from `greg@bidlow.co.uk`, through the real "Launch sequence"
button on the sequence cycles 109/110 had already brought to "Ready to
launch" — and it was Greg himself who clicked it, not this cycle.**

That last point matters and is stated plainly rather than smoothed over: row
92's brief for cycle 111 recorded that Cowork approval had been given for this
agent to perform the click. By the time this cycle reached the point of
minting a staff session to do exactly that, the click had already happened —
at 22:45:54 UTC, roughly midway through this cycle's own working window,
while this session was still debugging an unrelated tool problem (see
"How this was measured" below) and had not touched a browser yet. The
database evidence is unambiguous about who: the `OutboundEmail` row's
`staffUserId` resolves to `greg@bidlow.co.uk` — Greg's own real super-admin
account, with its real Entra object id, not the read-only-check placeholder
this cycle would have used had it minted a session itself. So this cycle's
job changed from "perform the send" to "verify and record the send that
already happened," and everything below is that verification, done without
touching anything that could send a second time.

## 1. What actually happened, and when

| | |
|---|---|
| Sequence | "Cycle 109 send-and-reply walk (v2) — 2026-08-29" (built by cycle 109, confirmed unchanged by cycle 110) |
| Clicked by | `greg@bidlow.co.uk` (real Entra object id `6840e50a-94f4-4034-9541-d45bd546c3c2`, `ADMIN`, super-admin) — read from `OutboundEmail.staffUserId`, not assumed |
| Client | `bidlowai` (id `cmpmhb5j40000gbo05h6oyc7j`) — the only allowlisted client |
| From | `greg@bidlow.co.uk` (BidlowAI's `defaultSenderEmail`, via mailbox `cmpnuhkwb000ygbodlh53zhlj`, `CONNECTED`) |
| To | `greg.visser64+cycle109@gmail.com` (a Gmail plus-alias Greg owns — the same contact cycle 109 imported) |
| Subject | "A quick note from BidlowAI" |
| Queued | 2026-08-29 22:45:53.584 UTC |
| Attempted | 2026-08-29 22:45:53.960 UTC |
| **Sent** | **2026-08-29 22:45:54.752 UTC** |
| Transport | Microsoft Graph (`microsoft_graph`) |
| Provider message id | `msgraph:sendmail:cmteyyrsj0004g1mgrm5jio64` |
| Row status | `SENT`, first attempt (`sendAttempt: 1`), no error fields set |
| `ClientEmailSequenceStepSend` | `status: SENT`, `outboundEmailId` points at the row above |

Queue → attempt → sent all landed inside about 1.2 seconds, which matches
this app's real launch path (queue the row, then dispatch it inline) rather
than waiting for the 5-minute cron — consistent with a genuine screen click,
not a staged database write.

## 2. The message body, as stored

```
Hi Greg,

This is a real screen-driven test of the ODoutreach send path (cycle 105, row 92), from BidlowAI.

No action needed.

Thanks,
Greg Visser

---
Unsubscribe: mailto:greg@bidlow.co.uk?subject=unsubscribe
```

One honest observation, not a defect this cycle is fixing: the template text
says "cycle 105" — a leftover from whichever earlier walk first wrote this
template's copy. The sequence and contact are genuinely cycle 109's, the
send is genuinely today's; only the template's own wording is stale. Worth a
copy fix next time someone is in that template, not urgent.

The opt-out is the mailto rail (`mailto:greg@bidlow.co.uk?subject=unsubscribe`)
— no foreign-domain link, consistent with the standing rule that a link
domain mismatch is what caused the 2026 quarantine.

## 3. Did it arrive?

**No bounce came back, checked from the sending side, and the recipient is
Greg's own inbox, so he can confirm the rest himself.**

Re-read directly from `OutboundEmail` several minutes after the send:
`status: SENT`, `failureReason: null`, `lastErrorCode: null`,
`lastProviderEventType: null`, `bounceCategory: null`, `providerStatus: null`
— nothing has come back to flip this row to `BOUNCED` or `FAILED`. Microsoft
Graph accepted and dispatched it.

What this does **not** prove, exactly as the 26 August proof was careful to
say: whether it landed in Inbox or Spam on the Gmail side. That is for Greg
to look at directly — it is his own mailbox — and this cycle does not claim
otherwise.

One thing this does prove that the 26 August send did not need to: the
mailbox reply-sync (which also carries bounce/NDR ingestion) only runs
weekdays 07:00–18:00 UK time. It is well outside that window right now, so
even if an NDR does eventually land in `greg@bidlow.co.uk`'s Inbox, this
system will not ingest and act on it until the next weekday morning. That is
a fact about timing, not a defect — recorded so nobody reads silence between
now and Monday as evidence either way.

## 4. Confirmed on the actual screens, not just in the database

A **read-only** check, after the fact: a `next-auth` session was minted with
the production `AUTH_SECRET` (via already-authenticated Azure CLI, same
technique cycles 106/109/110 used) for the OpensDoors staff account
`greg@opensdoors.co.uk`, loaded into headless Chromium via Playwright, and
used to load two production pages. **No button was clicked and no form was
submitted** — this was purely to see what a human operator sees now that the
send has happened.

| Screen | What it showed |
|---|---|
| `/clients/{bidlowai}/outreach?sequenceId=...` (sequence detail) | Status badge **"Sent"** in the sequence list; "Introductions sent — 1 introduction sent. No remaining recipients for this step."; **Ready: 0 · Blocked: 0 · Sent: 1**; "Ready now: 0 · Sent: 1" |
| `/clients/{bidlowai}/activity` | The send appears with recipient `greg.visser64+cycle109@gmail.com` and subject "A quick note from BidlowAI" |

Screenshots (`cycle111-sequence-detail.png`, `cycle111-activity.png`) were
taken and inspected, then deleted from the local machine along with the
scratch script that drove the check — nothing committed, matching cycle
106/109/110's own practice.

## 5. What this does and does not close on row 92

**Closes:** the send leg. A real email left the system for BidlowAI, through
the real screens, via the real Launch button, and there is no bounce. This is
the second time (after 26 August) a real send has been proven for this
client, and the first time it has happened through a sequence built and
launched via the actual operator screens rather than staged directly into the
queue.

**Does not close:** the reply leg. Row 92's brief for this cycle is explicit
that the reply cannot be performed here at all — a genuine external reply has
to be typed by a person at the receiving inbox
(`greg.visser64@gmail.com`, of which `+cycle109` is an alias), and this
workspace holds no second mailbox able to author one. Nothing in this cycle
attempted to simulate, script, or stand in for that reply. Whether it lands,
matches the right contact and thread, and flips this send to `REPLIED` is
still unproven through the screens and is exactly what the next attempt at
this row should check for — once a reply exists to check.

## Re-score dimension 1

**Held at 8, per this cycle's own brief, which is explicit that reaching a
send — even a genuine one — does not by itself move the score.** No change
made to `.bidlow/GRADES.json` this cycle. The score moves only once the reply
is matched.

## How this was measured, for whoever repeats it

The production database firewall allows Azure services only (confirmed again
this cycle: a direct connection attempt from this workstation is not the
right approach). Rather than reach for Prisma or `npm install pg` — which
turned out to be genuinely broken in this App Service's Kudu container this
session (`npm install` of *any* package, including zero-dependency ones,
fails immediately and deterministically with `Tracker "idealTree" already
exists`; not a stale-cache issue, reproduced after `npm cache clean --force`
and in three different directories) — this cycle wrote a small,
dependency-free Postgres client using only Node's built-in `net`/`tls`/
`crypto` modules (TLS negotiation + SCRAM-SHA-256, per RFC 5802) and ran it
inside the App Service container via the Kudu command API, exactly where
prior cycles ran their `pg`-based scripts. Every query was a plain `SELECT`;
nothing was written. The scratch scripts were uploaded via base64 through the
same command API (no VFS write endpoint was needed) and deleted from both
`/tmp/probe111` and `/home/tmp/probe111` on the container afterwards, along
with the local copies. No firewall rule was added and no credential left
Azure — `AUTH_SECRET` and `DATABASE_URL` were read via already-authenticated
`az` and used only for the duration of this check.

Kudu's `/api/command` on this container does not run commands through a
shell — arguments are split on whitespace with no support for `&&`, `|`, or
quoting. Every multi-step command in this cycle's recon was wrapped as
`sh -c "..."` explicitly to get real shell semantics; a few early attempts
before that was understood produced confusing partial results (e.g. `pwd`
silently absorbing `&& ls` as ignored positional arguments) and are not
reflected above because they read nothing and wrote nothing.

Also found and recorded, not fixed here, because it is a fact about a staff
record rather than a defect in the product: `StaffUser.entraObjectId` for
`greg@opensdoors.co.uk` currently holds the literal string
`cycle110-readonly-check` rather than a real Microsoft object id — evidently
written by an earlier cycle's session-minting script directly against the
database rather than obtained by signing in for real. The schema comment on
this column says first-login matches by email and re-attaches the real
object id, so this should self-heal the next time that account actually
signs in through Entra — but a prior cycle did write a placeholder value into
a real staff record in production, which is worth knowing even though it
appears recoverable. Not touched or reverted here, since this cycle's
instruction was narrowly to prove the send, not to audit or repair staff
records.
