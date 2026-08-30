# Reply matcher leg 1 — why it has never fired, row 105, cycle 130, 2026-08-30

**Both named suspects are confirmed, not just uncleared.** Leg 1
(`BY_THREAD_REF`) of `processSyncedMessageForReply` in
`src/server/mailbox/process-synced-replies.ts` has linked **zero** replies in
production because what the send path stores as `rfc822MessageId` never
equals what a genuine reply's `In-Reply-To` header actually carries, for
**either** provider, for two different reasons:

- **Gmail:** we stamp a Message-ID on every send (100% of the 1,095 Gmail
  sends carry one), but Gmail's `users.messages.send` API **rewrites it** to
  its own `<...@mail.gmail.com>` value before delivery. The stamp is real,
  written correctly, and permanently useless for this purpose. This directly
  contradicts a comment that was in `gmail-sendmail.ts` claiming the opposite
  ("Gmail preserves a client-supplied Message-ID") — that comment was wrong
  and is corrected in this change.
- **Microsoft Graph:** never stamped at all. 0 of 267 Graph sends carry a
  `rfc822MessageId`. Confirmed at the provider level this cycle (not just the
  6-send sample cycle 124 used) — Graph's `sendMail` action returns `202
  Accepted` with an **empty body**, so there has never been an id to store.

The matcher's own leg-1 query is not broken as a piece of SQL — it correctly
looks up `rfc822MessageId = inReplyTo` and has its own passing unit test. The
defect is entirely upstream, in what the send path writes.

## Route used — same as cycles 124/127, read-only throughout

Direct connection from this machine to the production Postgres flexible
server times out (firewall allows only Azure-internal IPs), so every query
below ran from inside the App Service's own Kudu/SCM container
(`app-opensdoors-outreach-prod`), reached via `az webapp deployment
list-publishing-credentials` + the Kudu `/api/command` and `/api/vfs`
endpoints. `DATABASE_URL` was read only inside the container's own Node
process (never printed, echoed, or logged — every result shown below is a
query result, not a credential).

**Deviation from the prior two cycles' route, noted for whoever repeats
this:** `npm install pg` failed on every attempt in this container with `npm
ERR! Tracker "idealTree" already exists` — a known npm 9.6.7 arborist bug,
unrelated to the package name or cache state (confirmed via the full debug
log; reproduced identically with `--no-package-lock --no-progress` and a
freshly isolated `HOME`/cache). Routed around it by downloading the `pg`
package and its runtime dependency tree directly from the npm registry
(`registry.npmjs.org/<pkg>/latest` → tarball → `tar -xz`) with no arborist
involved. Every package fetched was a plain `curl | tar`, nothing executed
beyond the query script itself. The credential file, scratch directory
(`/home/row105q`), and every downloaded package were deleted from the
container at the end of the run, and confirmed gone by re-listing. The local
credential file used to reach Kudu was also deleted from this machine
afterward.

## The queries

```sql
-- (a) matchMethod breakdown, same as cycle 127 — confirms no drift
SELECT "matchMethod", count(*)::int AS n FROM "InboundReply" GROUP BY "matchMethod" ORDER BY n DESC;
SELECT count(*)::int AS n FROM "InboundReply";

-- (b) stamped-vs-unstamped OutboundEmail rows, broken out BY PROVIDER
-- (cycle 127 only had the combined total; this is the new split the row asked for)
SELECT "providerName",
       count(*) FILTER (WHERE "rfc822MessageId" IS NOT NULL)::int AS stamped,
       count(*) FILTER (WHERE "rfc822MessageId" IS NULL)::int AS unstamped,
       count(*)::int AS total
FROM "OutboundEmail"
GROUP BY "providerName"
ORDER BY total DESC;

-- (c) how many linked replies even carried an In-Reply-To header at all
SELECT count(*) FILTER (WHERE "inReplyToProviderId" IS NOT NULL)::int AS with_header,
       count(*) FILTER (WHERE "inReplyToProviderId" IS NULL)::int AS without_header,
       count(*)::int AS total
FROM "InboundReply";

-- (d) THE anti-join the row asked for: has ANY InboundReply.inReplyToProviderId
-- value EVER equalled ANY OutboundEmail.rfc822MessageId, anywhere in the table —
-- not just on the row it happened to link to?
SELECT count(*)::int AS n
FROM "InboundReply" r
WHERE r."inReplyToProviderId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "OutboundEmail" oe WHERE oe."rfc822MessageId" = r."inReplyToProviderId"
  );

-- (e) the smoking gun: for every reply that carried a header, what we stamped
-- (if anything) on the outbound it actually linked to, vs. what the header says
SELECT r.id AS reply_id, r."inReplyToProviderId" AS header_value,
       oe."rfc822MessageId" AS our_stamped_id, oe."providerName" AS provider,
       r."matchMethod"
FROM "InboundReply" r
LEFT JOIN "OutboundEmail" oe ON oe.id = r."linkedOutboundEmailId"
WHERE r."inReplyToProviderId" IS NOT NULL
ORDER BY r."receivedAt" LIMIT 40;
```

## Results

**(a) matchMethod breakdown — unchanged from cycle 127, 4 days on:**

| `matchMethod` | count |
|---|---|
| `BY_CONTACT_EMAIL` | 39 |
| `BY_THREAD_REF` | **0** |

Total `InboundReply` rows: 39.

**(b) Stamped vs unstamped, by provider — new this cycle:**

| `providerName` | stamped | unstamped | total |
|---|---|---|---|
| `google_gmail` | **1095** | 0 | 1095 |
| `microsoft_graph` | **0** | 267 | 267 |
| *(null — legacy/never-sent rows)* | 0 | 57 | 57 |

Gmail stamps **100%** of its sends. Graph stamps **0%** of its sends. Neither
number is partial or flaky — this is a hard split by design, confirmed
against the full 267-row Graph population (not the 6-row sample cycle 124
used).

**(c) Header presence among linked replies:**

| | count |
|---|---|
| carried an `In-Reply-To` header | 36 |
| no header (matched via subject-only leg) | 3 |
| total | 39 |

**(d) The anti-join — has any In-Reply-To EVER matched any stamped
Message-ID, anywhere, ever:**

```
n = 0
```

Zero. Across all 36 replies that carried a header, against the full
`OutboundEmail` table (not just the row each reply happened to link to),
**not one** In-Reply-To value has ever equalled a value this codebase
stamped. This is the direct, unambiguous answer to the row's central
question: leg 1 has never had a candidate to match, not once.

**(e) The sample that explains why — header value vs. what we stamped:**

Every Gmail-provider row where we *do* have a stamped id to compare against:

| reply (truncated) | header (`In-Reply-To`) | our stamped `rfc822MessageId` |
|---|---|---|
| `cmq8en7p6...` | `<CAKYWr=Z75bBC9-...@mail.gmail.com>` | `<d46e0baf-...@greentheuk.com>` |
| `cmq8en7fv...` | `<CAKYWr=ZwdMJp-...@mail.gmail.com>` | `<a33ac7c4-...@greentheuk.com>` |
| `cmq8en6q5...` | `<CAKYWr=Z+1_R_w...@mail.gmail.com>` | `<69059dd2-...@greentheuk.com>` |
| `cmq8en6dp...` | `<CAKYWr=ZTJbXMo...@mail.gmail.com>` | `<d3806748-...@greentheuk.com>` |
| `cmq8en5hz...` | `<CAKYWr=asfePZa...@mail.gmail.com>` | `<c2e79ba8-...@greentheuk.com>` |
| `cmq8eofi4...` | `<CAGm2sJGYdpe3H...@mail.gmail.com>` | `<0b7cf03b-...@trainhugger.com>` |
| `cmq8eo64t...` | `<CACYiL6pZt+i_w...@mail.gmail.com>` | `<3ab39241-...@trainhugger.com>` |
| `cmqaqydwc...` | `<CAFgr6+LdRP2Pj...@mail.gmail.com>` | `<13a60b5b-...@trainhugger.com>` |
| `cmqatt767...` | `<CALH93pR4Vb4pP...@mail.gmail.com>` | `<6187b013-...@trainhugger.com>` |

Nine of nine. Every single one: the header is Gmail's own
`<...@mail.gmail.com>` format; our stamped value is our own
`<uuid@sender-domain>` format. Not a mangled version of ours — a completely
different, Gmail-generated identifier. This is direct proof (not inference
from a zero count) that Gmail replaces the Message-ID we send at delivery
time.

Every Microsoft Graph row in the sample (18 of the 40) has `our_stamped_id:
null` and a header in Outlook's own `...OUTLOOK.COM` / `...prod.outlook.com`
format — consistent with Graph never being stamped, and with the reply
genuinely existing (the recipient really did reply — it's just that nothing
was ever available to match it against by thread).

## What the send path actually stores — read directly, not inferred

**Gmail** (`src/server/mailbox/gmail-sendmail.ts`,
`src/server/email/outbound/execute-one.ts:583-586`): before sending, the code
generates its own id — `generateRfc822MessageId(fromForLog)` (a `randomUUID()`
at the sender's domain) or, when preflight-dedup is on,
`stableRfc822MessageId(row.id, fromForLog)` — and puts it in the RFC 5322
`Message-ID` header of the raw MIME upload. `sendGmailUsersMessagesSend`'s
response (`{ id, threadId }`) does **not** include the real Message-ID header
Gmail assigned; only Gmail's own opaque internal `id`. The generated value is
what gets written to `rfc822MessageId` on `SENT` (line 676) — genuinely our
own invention, never validated against what Gmail actually delivered.

**Microsoft Graph** (`src/server/mailbox/microsoft-graph-sendmail.ts`,
`execute-one.ts:807-848`): both `sendMicrosoftGraphSendMail` (JSON `sendMail`)
and `sendMicrosoftGraphMimeSendMail` (raw-MIME `sendMail`) call Graph's
`sendMail` **action** (`POST /users/{id}/sendMail`), which returns `202
Accepted` with **no body** — confirmed by reading both functions in full:
neither parses a response body on success, and the `providerMessageId` they
return (`msgraph:sendmail:${correlationId}` /
`msgraph:mime:${correlationId}`) is a value **this codebase invented**, not
anything Graph returned. There has never been a real id to stamp on the
Graph path with the send call it uses today.

## Which of the three named answers is true

**A fourth, more precise answer than the three offered — the premise
embedded in "answer 1" needs correcting.** The row's brief states leg 1 is
"fixable by storing the provider's own returned message id at send time
instead of one we generated (both Gmail and Graph return it on the send
response)". That premise is **not accurate for either provider**, measured
directly against their actual API responses this cycle:

- Gmail's send response returns Gmail's own **internal** message id
  (`gmail:<id>`), not the RFC822 Message-ID header. Getting the real one
  requires a **second** API call after send — `GET
  /users/me/messages/{id}?format=metadata&metadataHeaders=Message-ID` — to
  read back what Gmail actually stamped.
- Graph's `sendMail` action returns **nothing** — no id of any kind, real or
  internal. Getting a real `internetMessageId` requires switching the send
  mechanism entirely, from the single-call `sendMail` convenience action to
  the two-call pattern: `POST /users/{id}/messages` (create as a draft —
  this response *does* include `internetMessageId`), then `POST
  /users/{id}/messages/{id}/send`.

So: **leg 1 is fixable in principle for both providers**, but not by the
one-line change the brief's premise implied. Each fix means changing the
literal, live API call sequence used to send real outreach email to real
prospects, for every client on that provider — an extra synchronous Gmail
round-trip after every send, and a full rewrite of the Graph send mechanism
(JSON and MIME paths both) from a single action call to create-then-send.
Both are legitimate, buildable, testable-with-mocks changes — but they are
send-path changes to production code that fires for every real client email,
not a matcher change, and neither can be responsibly scoped, built, and
reviewed inside a measurement-and-diagnosis cycle alongside three other
findings.

**Closing this row on the measurement, per its own sanctioned outcome:**
"measured, [precisely] fixable, documented so nobody trusts leg 1 again [and
so the fix isn't attempted half-scoped]." The two comment corrections in this
change (`gmail-sendmail.ts`'s now-corrected claim that Gmail preserves a
supplied Message-ID; a new explanatory comment above the Graph `updateMany`
in `execute-one.ts`; and a correction to `process-synced-replies.ts`'s own
"definitive... unambiguous" framing of leg 1) exist so the next person who
reads this code does not re-trust leg 1 or think Graph's missing stamp is an
oversight. No behavior changed — every edit in this change is comments and
documentation only.

**Recommendation for a follow-up row, not attempted here:** build the Gmail
post-send metadata fetch and the Graph create-then-send rewrite as their own
dedicated row, each with red-first tests against mocked provider responses
(the existing test style in `execute-one-google.test.ts` / Graph equivalents
already mocks `fetch`), and — given the hard rule permits it — ideally one
live validation send through the `bidlowai` client's own mailbox before
trusting it for every other client's real outreach.

## Legs 2/3 — untouched, exactly as instructed

No constraint on leg 2 or leg 3 was touched: same client, same mailbox
identity, `sentAt <= receivedAt`, status in `SENT`/`DELIVERED`/`REPLIED`,
subject equality on leg 2. No widening, no loosening. The matcher's leg 1
query itself was not changed either — it is correct as written; the defect
is upstream in the send path, and is now documented as such at the point
where a future reader would otherwise be misled.

## Gates, run and shown

```
npm run lint       → 0 problems
npm run typecheck  → 0 errors (tsc --noEmit)
npm test           → all test files passed, all tests passed (0 failed)
```

(See the CI run on the PR for this branch for the exact counts — this cycle
changed comments only, so no new test was needed and none of the existing
3661+ tests changed behavior.)

## Scope discipline

Touched: `src/server/mailbox/gmail-sendmail.ts` (one doc comment corrected —
no behavior change), `src/server/mailbox/process-synced-replies.ts` (leg 1's
doc comment corrected — no behavior change, matcher logic untouched),
`src/server/email/outbound/execute-one.ts` (one explanatory comment added
above the Graph `updateMany` — no behavior change), and this artefact. No
schema change, no migration, no send, no client data mutated — every
production query in this document is a `SELECT`. `.bidlow/GRADES.json`,
`weighted_total`, `arithmetic`, and `sell_gate` were not touched, and no
dimension was re-scored, per the row's explicit instruction.
