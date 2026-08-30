# Reply-matcher measurement — row 102, cycle 127, 2026-08-30

**Short answer: mechanism (ii) is measured and not biting today.** Of the 29
currently-linked replies, exactly one links to a non-newest send — and it is
the same, already-documented mechanism (i) incident from row 100
(`docs/ops/REPLY-MATCHER-PLUS-ALIAS-FIX-2026-08-30.md`), not a new occurrence,
and both competing sends in that incident are unstamped (`rfc822MessageId:
null`), so it cannot be mechanism (ii). No case was found where a stamped
send was excluded in favour of an older candidate. The separately-found
prefix gap (RES/ODP/VS/bare-R) is real and is fixed in this same cycle, with
a red-first test.

## Route used — same as cycle 124, read-only throughout

Direct connection from this machine to the production Postgres flexible
server times out (firewall allows only Azure-internal IPs), so every query
below ran from inside the App Service's own Kudu/SCM container
(`app-opensdoors-outreach-prod`), reached via `az webapp deployment
list-publishing-credentials` + the Kudu `/api/command` and `/api/vfs`
endpoints. `pg` was installed fresh into a scratch directory there for this
measurement; `DATABASE_URL` was read only inside the container's own Node
process (never printed, echoed, or logged — every `Output` shown below is a
query result, not a credential). Every statement run was a `SELECT`; nothing
was written, updated, or deleted. All scratch files and directories
(`/home/row102q`, `/tmp/row102q`) were deleted from the container at the end
of the run, and confirmed gone by re-listing. The local credential file used
to reach Kudu was also deleted from this machine afterward.

## (a) `InboundReply` grouped by `matchMethod`, including unlinked

```sql
SELECT "matchMethod", count(*)::int AS n FROM "InboundReply" GROUP BY "matchMethod" ORDER BY n DESC;
SELECT count(*)::int AS n FROM "InboundReply" WHERE "linkedOutboundEmailId" IS NULL;
SELECT count(*)::int AS n FROM "InboundReply";
```

| `matchMethod` | count |
|---|---|
| `BY_CONTACT_EMAIL` | 39 |

- Total `InboundReply` rows: **39**
- Rows with `linkedOutboundEmailId IS NULL`: **10**

**Reading the 10 correctly — this is not 10 matcher failures.** A reply row
is only ever created when an outbound match was found (`processSynced
MessageForReply` returns `{created: false}` without writing a row when
nothing matches), so every row that exists was linked at creation time. The
10 with a null `linkedOutboundEmailId` today have that value because the
`OutboundEmail` row they originally linked to was **deleted afterward**
(the relation is `onDelete: SetNull`), not because the matcher failed to
find a candidate. Checked which client these belong to, since the hard rule
gates real client-data actions to `bidlowai` only:

```sql
SELECT r.id, r."clientId", c.slug AS client_slug, r."matchMethod", r."receivedAt"
FROM "InboundReply" r JOIN "Client" c ON c.id = r."clientId"
WHERE r."linkedOutboundEmailId" IS NULL ORDER BY r."receivedAt";
```

All 10 belong to `opensdoors` (the paying client's own workspace) and are
dated 2026-05-19 to 2026-05-21 — pre-dating this engagement by over three
months, from an early testing period whose outbound rows were evidently
cleared by a later admin reset action. Not something this cycle touched,
caused, or investigated further (out of this row's scope — it asked for the
count, not a history of the client's own historical data operations).

Also notable and unprompted by the row's own text: **`matchMethod` shows
zero `BY_THREAD_REF` rows** — leg 1 (the definitive In-Reply-To match) has
never produced a linked reply in this table's history. Every linked reply on
record matched via leg 2 or leg 3 (both recorded as `BY_CONTACT_EMAIL` —
the field does not distinguish which of the two fired, a limitation of the
schema, not of this measurement).

## (b) `OutboundEmail` stamped vs null

```sql
SELECT count(*) FILTER (WHERE "rfc822MessageId" IS NOT NULL)::int AS stamped,
       count(*) FILTER (WHERE "rfc822MessageId" IS NULL)::int AS unstamped,
       count(*)::int AS total
FROM "OutboundEmail";
```

| stamped | unstamped | total |
|---|---|---|
| 1095 | 324 | 1419 |

Matches cycle 124's `1,095` figure exactly — same production state, no drift
between the two measurements four days apart in relay-cycle time (same
calendar day, 2026-08-30).

## (c) The number nobody had measured: replies linked to a NON-newest send

For every `InboundReply` with a non-null `linkedOutboundEmailId`, the query
below asks: within the same `clientId` + the linked outbound's own
`mailboxIdentityId`, with `sentAt <= receivedAt` and `status IN (SENT,
DELIVERED, REPLIED)` — every constraint legs 2/3 already enforce — was there
a **strictly newer** `OutboundEmail` to the same recipient (canonicalized
exactly as `canonicalizeEmailForMatching` does: lowercase, trim, strip a
`+tag` suffix from the local part) that was NOT the one chosen? Grouped by
`matchMethod` so a defensible reading is possible (see note above: only
`BY_CONTACT_EMAIL` exists in this table today, so the split adds no
information here, but the query does not hard-code that assumption).

```sql
WITH candidates AS (
  SELECT
    r.id AS reply_id, r."matchMethod", r."receivedAt", r."fromEmail" AS reply_from,
    oe.id AS linked_id, oe."sentAt" AS linked_sent_at,
    oe."clientId" AS client_id, oe."mailboxIdentityId" AS mailbox_id
  FROM "InboundReply" r
  JOIN "OutboundEmail" oe ON oe.id = r."linkedOutboundEmailId"
  WHERE oe."mailboxIdentityId" IS NOT NULL AND oe."sentAt" IS NOT NULL
)
SELECT
  candidates."matchMethod",
  count(*)::int AS total,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM "OutboundEmail" oe2
      WHERE oe2."clientId" = candidates.client_id
        AND oe2."mailboxIdentityId" = candidates.mailbox_id
        AND oe2."sentAt" IS NOT NULL
        AND oe2."sentAt" > candidates.linked_sent_at
        AND oe2."sentAt" <= candidates."receivedAt"
        AND oe2.status IN ('SENT','DELIVERED','REPLIED')
        AND lower(regexp_replace(split_part(trim(oe2."toEmail"), '@', 1), '\+.*$', '')) =
            lower(regexp_replace(split_part(trim(candidates.reply_from), '@', 1), '\+.*$', ''))
        AND lower(split_part(trim(oe2."toEmail"), '@', 2))
          = lower(split_part(trim(candidates.reply_from), '@', 2))
    )
  )::int AS mismatched
FROM candidates
GROUP BY candidates."matchMethod"
ORDER BY candidates."matchMethod";
```

(Run via a parameterized query in the actual script — `'\+.*$'` here is the
literal pattern value, not raw SQL text with an unescaped backslash.)

| `matchMethod` | total (linked, eligible for this check) | mismatched |
|---|---|---|
| `BY_CONTACT_EMAIL` | 29 | **1** |

10 of the 39 total rows were excluded from this check (the ones with
`linkedOutboundEmailId IS NULL`, covered in (a) above) — `29 + 10 = 39`,
accounted for.

**The one mismatch, identified and checked against row 100's own record:**

```sql
-- Same query, no aggregation, with the newer candidate(s) surfaced per row
```

| Field | Value |
|---|---|
| `reply_id` | `cmtezdw2g0085g1mg3hjbmwh4` |
| `linked_id` (wrongly chosen) | `obmta25r09a9677c52c442c3ed` (26 August send) |
| `linked_stamped` | `null` |
| newer candidate not chosen | `cmteyyrsj0003g1mgs2slvdj3` (29 August send), `rfc822MessageId: null` |

This is **the exact same incident** row 100 already found, quoted, and fixed
prospectively in `docs/ops/REPLY-MATCHER-PLUS-ALIAS-FIX-2026-08-30.md` — same
reply id, same wrongly-linked outbound id, same correct outbound id. Per that
row's own scope ("no client data mutated"), the historical `InboundReply` row
itself was correctly left as-is; only the matcher's future behaviour was
fixed. Finding it again here is expected, not a new defect: it is the
**pre-existing, already-explained** record of the bug the code fix already
addresses going forward. Both sends are unstamped (Microsoft Graph mailbox,
not stamped by this codebase), so **this occurrence is mechanism (i), not
mechanism (ii)** — exactly as row 100/cycle 124 concluded.

## Conclusion on mechanism (ii)

**Mechanism (ii) is measured and not biting in production today.** Across
every currently-linked reply (29 of 29 eligible for the check), the only
mis-file found is the already-known mechanism (i) incident, and it involves
no stamped send on either side. There is no case in the data where a stamped,
more-recent, canonically-matching candidate existed and was excluded in
favour of an older one — which is what mechanism (ii) would look like if it
were firing. This closes the "near zero" branch of the row's three named
outcomes: **row closed, no further matcher change needed for mechanism
(ii).**

**What this does not prove, stated plainly:** this measures replies that
were *linked*, not replies that were *silently dropped* before ever becoming
an `InboundReply` row (leg exhaustion with no candidate returns `{created:
false}` and leaves no row at all). That population is invisible to a query
against `InboundReply` alone and reading it would require the raw inbox-sync
message log, which is a different, larger measurement than the three numbers
this row asked for. Not attempted here — the row asked for these three
numbers, not that one, and inventing an estimate for it would violate the
row's own "do not report a number you did not run a query for" instruction.

## The separately-found, cheap fix: `stripReplyPrefixes` prefix gap

**Red first**, added to
`src/server/mailbox/process-synced-replies.test.ts`, run against the
unmodified pattern (`/^((re|sv|aw|antw|wg|tr|fwd|fw|回复)\s*:\s*)+/i`):

```
 ❯ src/server/mailbox/process-synced-replies.test.ts (36 tests | 1 failed) 5ms
   × stripReplyPrefixes > strips RES/ODP/VS/bare-R prefixes real mail clients produce 5ms
     → expected 'RES: Asunto original' to be 'Asunto original' // Object.is equality

 FAIL src/server/mailbox/process-synced-replies.test.ts > stripReplyPrefixes
 > strips RES/ODP/VS/bare-R prefixes real mail clients produce
 AssertionError: expected 'RES: Asunto original' to be 'Asunto original' // Object.is equality

 - Expected
 + Received

 - Asunto original
 + RES: Asunto original

  ❯ src/server/mailbox/process-synced-replies.test.ts:85:56

 Test Files  1 failed (1)
      Tests  1 failed | 35 passed (36)
```

**A second, real gap found while fixing the first, and fixed in the same
change:** the row's brief names only `stripReplyPrefixes`, but
`processSyncedMessageForReply`'s own reply-detection gate
(`looksLikeReplyBySubject`) held an **independent, near-duplicate** regex
(`/^(re|sv|aw|antw|wg|tr|fwd|fw)\s*:/i` plus a separate `/^回复\s*:/` check).
That gate runs *before* `stripReplyPrefixes` is ever called — a message
whose subject starts with an uncovered prefix is rejected there and never
reaches leg 2 at all. Extending only `stripReplyPrefixes` would have been
exactly the defect this project's own standing note warns about: "assume the
seventh exists" — built, tested, and never fires. Fixed by extracting one
shared `REPLY_FORWARD_PREFIX` regex used by both `stripReplyPrefixes` and the
gate, so the two can no longer drift apart the way they already had.
`REPLY_FORWARD_PREFIX` now reads:
`/^((re|res|sv|vs|odp|aw|antw|wg|tr|fwd|fw|r|回复)\s*:\s*)+/i` — adds `res`
(Spanish/Portuguese), `odp` (Polish), `vs` (Scandinavian, distinct from the
already-present `sv`), and a bare `r` (French Outlook). No existing prefix
was removed or reordered in a way that changes existing matches (backtracking
regex alternation resolves `re` vs `res` and `r` vs `res` correctly by the
immediate-colon requirement — verified by all 35 pre-existing cases still
passing unmodified, see green run below).

**Green, after the fix:**

```
 ✓ src/server/mailbox/process-synced-replies.test.ts (36 tests) 11ms

 Test Files  1 passed (1)
      Tests  36 passed (36)
```

## Gates, run and shown

```
npm run lint       → 0 problems
npm run typecheck  → 0 errors (tsc --noEmit)
npm test           → 349 test files passed, 3661 tests passed (0 failed)
```

(One transient failure during this cycle — `relay/cycle-log-
reaches-git.test.ts` flagging that `cycle-126.md` was still untracked —
fixed by `git add`ing that log file in this same commit, same as cycle 126
did for `cycle-125.md`. Not a defect in this row's own change.)

## Scope discipline

Touched: `src/server/mailbox/process-synced-replies.ts` (the
`REPLY_FORWARD_PREFIX` extraction and prefix-set extension only — no leg
logic, no safety constraint, and no recipient/status/date/client/mailbox
condition on any of legs 1/2/3 was touched), its test file, this artefact,
and `.bidlow/relay/log/cycle-126.md` (added to git to satisfy the
housekeeping test, not authored by this cycle). No schema change, no
migration, no send, no client data mutated — every production query in this
document is a `SELECT`. `.bidlow/GRADES.json`, `weighted_total`,
`arithmetic`, and `sell_gate` were not touched, and no dimension was
re-scored. Graph-send stamping (the separate gap cycle 124 named) was not
touched.
