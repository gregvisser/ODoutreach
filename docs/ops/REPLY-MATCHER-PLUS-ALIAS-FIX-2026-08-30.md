# The reply-matcher fix — row 100, cycle 124, 2026-08-30

**Short answer: mechanism (i) fired — the Gmail plus-alias drop — not
mechanism (ii). Both competing production sends carried `rfc822MessageId:
null` (the sending mailbox is Microsoft Graph, which this codebase does not
yet stamp), so leg 3's `rfc822MessageId: null` exclusion never had a stamped
send to exclude in this incident; it is a real, separate structural risk for
a future Gmail-stamped send, but it is not what caused the 29 August
mismatch. The matcher is fixed (code + red-first test, both merged). Dimension
1 and the sell gate are UNTOUCHED, and the underlying journey — a fresh real
send, a real human reply, a correct live match — remains UNOBSERVED. See
"What this does not prove" below.**

## 1. The two production rows, read READ-ONLY, quoted verbatim

Read directly from the production Postgres database
(`pg-opensdoors-outreach-prod-01`) via a short-lived `pg` client run inside
the App Service's own Kudu/SCM container (same VNet the app itself runs in;
`DATABASE_URL` read from the container's own environment, never printed or
stored outside memory for the query). No row was written, updated or
deleted — every query below is a `SELECT`. Scratch files
(`scratch-row100-*.{js,txt,json}`) and the temporary `/tmp/row100` directory
and uploaded `tmp_query_upload*.js` files inside the Kudu container were
deleted before this cycle ends.

```sql
SELECT id, "toEmail", "rfc822MessageId", subject, "sentAt", "mailboxIdentityId", status, "clientId"
FROM "OutboundEmail" WHERE id = ANY($1) ORDER BY "sentAt" ASC;
-- ids: ['obmta25r09a9677c52c442c3ed', 'cmteyyrsj0003g1mgs2slvdj3']
```

| Field | 26 August send (`obmta25r09a9677c52c442c3ed`) | 29 August send (`cmteyyrsj0003g1mgs2slvdj3`) |
|---|---|---|
| `toEmail` | `greg.visser64@gmail.com` | `greg.visser64+cycle109@gmail.com` |
| `rfc822MessageId` | `null` | `null` |
| `subject` | `ODoutreach live send check - 26 August` | `A quick note from BidlowAI` |
| `sentAt` | `2026-08-26T12:16:36.366Z` | `2026-08-29T22:45:54.752Z` |
| `mailboxIdentityId` | `cmpnuhkwb000ygbodlh53zhlj` | `cmpnuhkwb000ygbodlh53zhlj` (same mailbox) |
| `status` | `REPLIED` | `SENT` |

```sql
SELECT id, "fromEmail", "toEmail", subject, "receivedAt", "matchMethod", "linkedOutboundEmailId"
FROM "InboundReply" WHERE id = 'cmtezdw2g0085g1mg3hjbmwh4';
```

| Field | Value |
|---|---|
| `fromEmail` | `greg.visser64@gmail.com` (alias dropped by Gmail's Reply button) |
| `subject` | `RE: A quick note from BidlowAI` |
| `matchMethod` | `BY_CONTACT_EMAIL` |
| `linkedOutboundEmailId` | `obmta25r09a9677c52c442c3ed` — **the 26 August send, wrong** |

The sending mailbox itself was also read:

```sql
SELECT id, provider, email FROM "ClientMailboxIdentity" WHERE id = 'cmpnuhkwb000ygbodlh53zhlj';
-- {"id":"cmpnuhkwb000ygbodlh53zhlj","provider":"MICROSOFT","email":"greg@bidlow.co.uk"}

SELECT count(*) FILTER (WHERE "rfc822MessageId" IS NOT NULL) AS stamped, count(*) AS total
FROM "OutboundEmail" WHERE "mailboxIdentityId" = 'cmpnuhkwb000ygbodlh53zhlj';
-- {"stamped":"0","total":"6"}

SELECT count(*) AS stamped_total FROM "OutboundEmail" WHERE "rfc822MessageId" IS NOT NULL;
-- {"stamped_total":"1095"}
```

## 2. Which mechanism fired — worked out from the matcher's own logic, not guessed

Both candidate outbounds have `rfc822MessageId: null` because the sending
mailbox (`greg@bidlow.co.uk`) is **Microsoft Graph**, not Gmail — this
codebase does not yet stamp Graph sends (0 of this mailbox's 6 sends are
stamped; 1,095 rows elsewhere in the table are, presumably Gmail sends via
other mailboxes). So:

- **Leg 1 (BY_THREAD_REF)** could never have matched either row regardless of
  the reply's `In-Reply-To` header — neither row has a `rfc822MessageId` to
  match against. Not the cause of this incident (a separate, pre-existing gap
  in Graph-send stamping, out of this row's scope).
- **Leg 2 (subject-anchored)** requires `toEmail = from AND subject =
  strippedSubject`. The reply's stripped subject (`A quick note from
  BidlowAI`) equals the **29 August** row's subject exactly, but the reply's
  `from` (`greg.visser64@gmail.com`, alias dropped) does not equal that row's
  `toEmail` (`greg.visser64+cycle109@gmail.com`). No row satisfies both
  conditions, so leg 2 finds nothing — it correctly refused the 26 August row
  on the subject mismatch, but never got the chance to accept the right one.
- **Leg 3 (legacy fallback)** requires `toEmail = from AND rfc822MessageId =
  null`, no subject check. The 26 August row satisfies both (`toEmail`
  matches literally, `rfc822MessageId` is null) — **this is the leg, and the
  literal `toEmail` equality, that produced the wrong link.**

**Conclusion: mechanism (i) fired — the plus-alias drop defeated leg 3's
literal `toEmail` equality.** Mechanism (ii) (a stamped send being
structurally excluded from leg 3) is real as a *description of the code* but
was **not** the active cause here, because neither competing send was
stamped in the first place — the Graph-mailbox stamping gap is a distinct,
unraised issue and is explicitly left alone (out of scope for this row).

## 3. Red first — the failure, quoted verbatim, before any fix

Added to `src/server/mailbox/process-synced-replies.test.ts`, reproducing the
exact production shape (two sends to the same person/mailbox — an older one
with the literal address, a newer one with a `+tag` alias — and a reply whose
`From` matches the bare address only), run against the **unmodified**
matcher:

```
 ❯ src/server/mailbox/process-synced-replies.test.ts (35 tests | 1 failed) 16ms
   × processSyncedMessageForReply > row 100: leg 3 picks the NEWER of two candidates
     once alias-canonicalized, not the older exact toEmail match 5ms
     → expected false to be true // Object.is equality

 FAIL src/server/mailbox/process-synced-replies.test.ts > processSyncedMessageForReply
 > row 100: leg 3 picks the NEWER of two candidates once alias-canonicalized, not the
 older exact toEmail match
 AssertionError: expected false to be true // Object.is equality

 - Expected
 + Received

 - true
 + false

  ❯ src/server/mailbox/process-synced-replies.test.ts:625:28
    623|     });
    624|
    625|     expect(result.created).toBe(true);
    626|     expect(prismaMock.inboundReply.create).toHaveBeenCalledWith({
    627|       data: expect.objectContaining({ linkedOutboundEmailId: "ob-newer…

 Test Files  1 failed (1)
      Tests  1 failed | 34 passed (35)
```

All 34 pre-existing tests in the file passed unmodified against the
unfixed matcher — this is a genuine, isolated new failure, not a broken
fixture.

## 4. The fix, and the design choice

**Design decision: compare the recipient canonically in application code
against a narrower database fetch, rather than adding a new database column.**

`toEmail: from` is a Prisma `WHERE` equality — it cannot express "equal after
stripping a `+tag`" as a database predicate without either (a) a new,
write-time-normalized column, or (b) fetching a bounded candidate set and
comparing canonically in code. Chose **(b)**, for two reasons:

1. **No schema change was needed**, per this row's own instruction to avoid
   one unless the design genuinely requires it. A normalized-recipient column
   would need a migration, a backfill of the existing ~thousands of
   `OutboundEmail` rows, and write-path changes everywhere an outbound is
   created — for a comparison that a bounded in-code filter already does
   correctly and cheaply.
2. **The fetch stays bounded by every existing safety constraint** — leg 2's
   query still narrows by `clientId`, `mailboxIdentityId`, `sentAt <=
   receivedAt`, `status IN (SENT, DELIVERED, REPLIED)`, and the exact subject
   match; leg 3's query still narrows by the same client/mailbox/status/date
   scope plus `rfc822MessageId: null`. Only the recipient equality moved from
   the `WHERE` clause to an in-code `canonicalizeEmailForMatching` comparison
   on the (already small, per-mailbox) result. **No existing safety
   constraint was dropped or widened** — a stranger's mail still cannot be
   attributed to a prospect, because every other narrowing clause is intact
   and the canonical comparison only ever equates two forms of the *same*
   mailbox address.

New function, `canonicalizeEmailForMatching` in `src/lib/normalize.ts`,
built on top of the existing `normalizeEmail` (reused, not reinvented):
lowercase + trim, then strip a `+tag` suffix from the local part only.
Deliberately **not** used for suppression, unsubscribe, or contact
de-duplication — those keep the literal address on purpose (collapsing
aliases there is a business decision, not a matching one, per the file's own
existing `RULING 3` precedent for domain-candidate widening).

`src/server/mailbox/process-synced-replies.ts` legs 2 and 3 changed from
`prisma.outboundEmail.findFirst({ where: { ..., toEmail: from } })` to
`prisma.outboundEmail.findMany({ where: { ...(same constraints, minus
toEmail) } })` followed by `candidates.find(c =>
canonicalizeEmailForMatching(c.toEmail) ===
canonicalizeEmailForMatching(from))` — the array is already `orderBy: {
sentAt: "desc" }`, so `.find()` preserves the existing "most recent wins"
behaviour once more than one candidate canonically matches. Leg 1
(BY_THREAD_REF, keyed on the exact `rfc822MessageId`) was left untouched —
it is unrelated to this defect and is not one of the two candidate
mechanisms named in this row.

## 5. Green, after the fix

Same test, same matcher, now fixed:

```
 ✓ src/server/mailbox/process-synced-replies.test.ts (35 tests) 11ms

 Test Files  1 passed (1)
      Tests  35 passed (35)
```

One other test file (`src/server/mailbox/reply-optout-body.test.ts`) mocked
`prisma.outboundEmail` directly and needed the same `findMany` mock added —
updated, still green (3 tests).

Full gates, run and shown, not assumed:

```
npm run lint       → 0 problems
npm run typecheck  → 0 errors (tsc --noEmit)
npm test           → 348 test files passed, 3655 tests passed (0 failed)
```

## 6. What this row may NOT claim — stated plainly, per its own instruction

**Dimension 1 (Core journeys end-to-end) and the sell gate are untouched.**
Neither `.bidlow/GRADES.json` nor any scorecard field was edited this cycle.
The matcher defect that mis-linked the 29 August reply is fixed and proven by
a red-first unit test, but **the underlying end-to-end journey — a fresh real
send, a real human reply, and a correct live match — remains UNOBSERVED**.
Closing that requires a new real send (through the real product screens, to
`bidlowai` only, per the hard rule) followed by a real human reply and a
fresh check that the live matcher links it correctly. That observation is a
separate, future action — not performed here, and not claimed here.

## 7. Scope discipline

Touched: `src/lib/normalize.ts` (+ its test file), `src/server/mailbox/process-synced-replies.ts`
(+ its test file), `src/server/mailbox/reply-optout-body.test.ts` (mock update only,
no behavioural change), and this artefact. No schema change, no migration, no
send, no client data mutated (every production query above is a read), and no
edit to `.bidlow/GRADES.json` or the sell gate.
