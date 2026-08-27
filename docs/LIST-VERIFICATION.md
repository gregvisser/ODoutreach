# List verification and automatic safety limits — what exists, 2026-08-27

Written against the commitment "list verification + automatic safety limits by
31 August". This is the honest inventory, followed by what was built to close
the gap and the one decision left for Greg.

## The short version

"List verification" in the cold-outreach industry means two different things
that get sold under one name:

1. **Domain-level** — can this domain receive email at all? Answered from
   public DNS. Free. Catches typos, dead companies, parked and web-only
   domains.
2. **Mailbox-level** — does this specific person's mailbox exist? Answered by
   probing the recipient's mail server over SMTP, which is what ZeroBounce,
   NeverBounce, MillionVerifier and friends sell per address.

**(1) is now built and switched on. (2) is not, and is a paid decision — see
"The open question" below.**

## What already existed

| Protection | Where | Status |
|---|---|---|
| Suppression / do-not-contact re-check at dispatch | `suppression-guard.ts`, called from `execute-one.ts` | live |
| Hard-bounce auto-suppression | `bounce-suppression.ts` | live (`BOUNCE_SUPPRESSION_ENABLED=true`) |
| Per-mailbox daily send cap, ledger-enforced | `sending-policy.ts` | live |
| Send pacing / throttling | `send-pacing.ts` | live |
| 10-day re-contact cooldown | `recent-send-cooldown.ts` | live |
| Address format check **at CSV import** | `import-csv.ts` | live |
| Address format check **at RocketReach import** | `person-import.ts` | live |

So the "automatic safety limits" half of the commitment was already met: caps,
pacing, cooldown and bounce suppression all exist and all run.

## What did NOT exist, and now does

Address verification **before sending** was genuinely absent. Two holes:

1. **The format check had a way around it.** Contacts materialised from the
   Universe (`universe-to-client-list.ts`) never pass through either import
   validator — that code checks only that the address is non-empty. An address
   of any shape could become sendable that way.

2. **Nothing anywhere asked whether the domain could receive mail.** A regex is
   perfectly happy with `someone@gmial.com`. Only DNS knows that domain does not
   exist. This is the check that actually predicts a bounce, and it was missing
   entirely — no MX lookup existed anywhere in the send path.

### What was built

- `src/lib/safety/recipient-verification-policy.ts` — the decision (pure).
- `src/server/outreach/recipient-mail-route.ts` — the DNS lookup + a per-domain
  cache.
- Wired into `src/server/email/outbound/execute-one.ts`, at dispatch, so it
  covers every send path regardless of how the contact was created.

It runs at **dispatch**, not at import, for the same reason suppression does: a
list loaded last month is sent today, and a company that folded in between still
has rows sitting in the queue.

### The three outcomes

| What DNS says | What happens | Row status |
|---|---|---|
| MX record, or an A record acting as implicit MX (RFC 5321 §5.1) | sends normally | `SENT` |
| Domain does not exist (NXDOMAIN) | **refused** | `FAILED` / `RECIPIENT_DOMAIN_DOES_NOT_EXIST` |
| Domain resolves but publishes no mail route, incl. RFC 7505 null MX | **refused** | `FAILED` / `RECIPIENT_DOMAIN_CANNOT_RECEIVE_MAIL` |
| Address is malformed | **refused**, without asking DNS | `FAILED` / `RECIPIENT_ADDRESS_MALFORMED` |
| The lookup itself failed (SERVFAIL, timeout) | **deferred** — back on the queue, retried | `QUEUED` |

That last row is the important one. A resolver having a bad minute is evidence
about the resolver, not about the recipient. Blocking on it would turn a DNS
blip into a silent send outage for a live client; sending on it would defeat the
gate. So the row is neither sent nor failed — it is tried again.

### One known narrowness, recorded deliberately

The format check reuses `isValidEmailFormat` — the repo's single existing
definition of a valid address, already applied at CSV and RocketReach import.
That regex rejects some technically-legal local parts, most realistically an
apostrophe: `o'brien@company.com` fails it.

This is accepted rather than fixed, for two reasons. Using a *looser* definition
at dispatch than at import would mean the system had two disagreeing answers to
"is this a valid address?", which is worse than being slightly strict. And in
practice such an address cannot already be in the database: every ingestion path
applies this same regex, and Universe rows originate from those paths, so there
is nothing in the system for the dispatch check to newly reject.

Loosening the shared regex is a separate change with its own blast radius —
it would relax import validation too — and was deliberately not bundled here.

### Why this one is ON by default

The repo's usual convention for send-path work is a flag defaulting to OFF. This
one ships ON, deliberately. The failure this project has repeated most often is
building something, wiring it, reporting success, and never having it fire — a
default-off flag is that outcome by construction.

It is safe to leave on because the blocking condition is narrow: only a
provably-dead domain fails a row, and every other outcome including a bug in the
check defers rather than fails. The worst case is delayed mail, not lost mail.
`RECIPIENT_VERIFICATION_ENABLED=false` turns it off without a deploy.

### Proof it fires

`src/server/email/outbound/execute-one-address-verification.test.ts` runs the
real dispatcher with only `node:dns` faked, and every assertion ends at
"nothing was handed to Gmail". The suite was also verified capable of failing:
disabling the gate turns 7 of its 12 tests red, and the 5 that stay green are
exactly the good-address and kill-switch cases that should.

## The open question — for Greg, not for an agent

**Do we buy mailbox-level verification?**

Domain-level verification cannot tell you that `john.smith@realcompany.com` is a
real person when `realcompany.com` is a real company. Only an SMTP probe can,
and that is a paid, per-address service.

Rough figures, to be re-checked before committing — these are list prices and
move around:

- ZeroBounce / NeverBounce / MillionVerifier all sit in the region of
  £0.001–£0.008 per address depending on volume and vendor.
- At OpensDoors' volumes this is small in absolute terms, but it is a recurring
  per-address cost against a third party, and it is a new data-processor
  relationship — every prospect address would be sent to that vendor, which has
  UK GDPR implications the client would need to be told about.

That combination — recurring spend plus a new processor handling client data —
makes it Greg's call and a client conversation, not something an agent decides.

Two things worth weighing when deciding:

- SMTP probing is increasingly unreliable against Microsoft 365 and Google
  Workspace, which are most of OpensDoors' recipients. Both accept-then-discard
  rather than rejecting at RCPT TIME, so a large share of results come back
  "unknown" — you can pay per address for an answer you do not get.
- Bounce suppression already catches a bad mailbox after **one** send. Paid
  verification's value is avoiding that one bounce, not avoiding repeats.

**Recommendation: do not buy it yet.** Run with domain verification for a month
and measure the bounce rate. If bounces are dominated by dead domains, this is
already solved for free. If they are dominated by dead mailboxes at live
domains, that is the evidence that justifies the spend, and we will have it.

## Still not built (noted, not done)

- **A bounce-rate circuit breaker.** Bounce suppression suppresses the
  individual address that bounced, but nothing automatically halts a mailbox or
  a client when the bounce rate spikes. This is the one genuinely missing
  "automatic safety limit", and it is the standard deliverability protection —
  it is what would have limited the damage in the 2026 quarantine. Worth a
  cycle of its own.
- **Role-address detection** (`info@`, `sales@`, `admin@`) — higher complaint
  risk, and worth flagging at import rather than blocking at send.
- **Auto-suppressing a domain that fails verification**, so the whole client
  list is cleaned rather than each row failing individually on its own attempt.
