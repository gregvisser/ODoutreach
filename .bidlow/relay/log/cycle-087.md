# Cycle 87 — queue item 80

## What it did

Shipped the third slice of row 80: **`/replies`, the cross-client queue of
replies still waiting on a human.** Row 80 stays `PARTIAL 87` — items 3–7 are
untouched and the token prices are still unverified.

## PR sweep

`gh pr list --state open` returned **nothing**. Cycle 86 left the board clean and
this cycle inherited it. Nothing to merge, nothing to leave a comment on.

## What I found before building, which changed the plan

The brief's own `PARTIAL 86` note named the next job as "verify the prices". That
is still right and still blocked (below), so I went to the row's stated order of
value instead — and reconnaissance corrected two assumptions:

* **Item (2), "stop the sequence the instant someone replies", is ALREADY DONE.**
  `process-synced-replies.ts:252` calls `stopFollowUpsForLinkedReply` on every
  matched reply, shipped in PR #137. No work needed; the queue row does not know
  this.
* **Item (1) was only half delivered, and the missing half is the half the row
  says is valuable.** Classification shipped in cycle 85 and the label is
  rendered in exactly ONE place: a coloured badge inside each client's Activity
  panel (`client-outreach-replies-panel.tsx`). `HUMAN_ATTENTION_LABELS` exists
  and its comment says "drives the UI ordering" — it drives nothing but a badge
  colour. So to find the person who said yes, an operator had to open thirty-odd
  workspaces in turn and scan each one.

The row does not say "label replies". It says *"routing a 'yes, happy to talk' to
a human within minutes is worth more than every open-count feature on the owner's
list combined."* **Labelling a reply is not routing it.** That gap was the cycle.

I also checked the two things that could already have been the routing, and
neither is: the `NewReplyNotifier` toast is transient, per-browser,
watermarked, shows only the single newest reply and shouts as loudly for a
rejection as for a booking; and the daily digest (`alert-copy.ts`) is
infrastructure health only — it has no concept of a hot lead.

## What shipped

`/replies` — every reply still owed a human, across every client, in the sidebar
directly under Reports. Bookings first, then referrals and unreadable replies,
then diary jobs; **longest-waiting first inside each band**, which is deliberately
the opposite of the Activity panel's newest-first. This is a work queue, not a
feed: the oldest unanswered warm lead is the one about to be lost.

The routing rule is a pure module (`src/lib/inbox/needs-a-person.ts`, 19 tests)
so it is testable without a database, a key or a bill.

### Three decisions worth Greg's eye

1. **What takes a reply OFF the list.** Three *durable* signals: an operator
   marked it handled, we wrote back, or the contact went to do-not-contact. The
   advisory `ReplyClaim` is deliberately NOT one of them — it is deleted the
   moment somebody acts and expires after 30 minutes anyway, so its absence
   cannot tell "nobody has touched this" from "dealt with an hour ago". Using it
   would have produced a queue that empties and then refills itself.
2. **An UNCLASSIFIED reply stays IN the queue.** This is the line that matters in
   production *today*: `ANTHROPIC_API_KEY` is unset in Azure, so every real reply
   arrives with a null classification. Dropping null would leave this screen
   confidently empty while the entire inbox went unrouted — the exact
   built-wired-reported-success-never-fired defect. The schema already said so at
   the column; the code now agrees, and a test holds it there.
3. **Overdue at 4h for a booking, 24h for a referral.** The brief's ambition is
   "within minutes". A threshold of minutes would be the literal transcription
   and would also paint every row red permanently, and a screen that is always on
   fire is one nobody reads.

`NOT_INTERESTED` and `UNSUBSCRIBE` are the only labels that leave the queue: a
rejection needs no action, and an opt-out was already actioned at ingest by
`suppressReplyOptOut` — the machine honoured it before a person could.

## Red first, and watched

19 tests written against a deliberately naive stub. Watched **13 fail, 6 pass** —
and the 6 that passed were exactly the negative assertions (`NOT_INTERESTED`
excluded, handled drops out) that a stub returning `false` satisfies for free.
That split is the useful part: it proves the positive routing claims were not
vacuous.

## Proven to fire, not merely to exist

Seven replies are seeded with ages relative to the run; the spec asserts the exact
five that must appear, **in order**, plus the two that must never. Then the wiring
was broken twice **and rebuilt each time**:

| Break | Result |
|---|---|
| Query returns nothing | **4 of 6** e2e red |
| Unclassified replies dropped | **3 e2e + 2 unit** red; screen read `4` where it should say `5` |

The two that survived break A are correctly the ones that expect an absence (no
rejections listed) and the sidebar link.

**The finding worth keeping: the 29-screen walk passed `/replies` under BOTH
breaks.** It asserts an `<h1>` renders, so it cannot tell an empty table from a
broken one. Adding a screen to the walk is not evidence that the screen works —
this project has shipped that mistake six times this week, and the walk is
structurally incapable of catching it. The dedicated spec is the thing that
catches it.

## Gates

lint clean · typecheck clean · `npm test` **3307 passed / 326 files** (up from
3288 / 325) · `npx playwright test` **86 passed, 1 skipped** · build green.

No schema change, no migration, no send path touched, no client data moved. The
screen is read-only and links to the reply-detail page where the buttons already
live.

## Frozen boundaries

Three frozen e2e files amended — `screen-walk.spec.ts`, `fixtures.ts`,
`seed-e2e.ts` — all strictly ADDITIVE, all recorded in `.bidlow/FROZEN.json` as
*"Claude (agent), relay cycle 87, for Greg's review"*, following the precedent
cycle 86 set. I did **not** record any of them under Greg's name: the gate exists
to stop an agent editing a spec to match code it just wrote, and signing his name
to my own change would defeat it. The new spec is now frozen too.

My first attempt edited `screen-walk.spec.ts` before I knew it was frozen, and the
gate blocked the *next* edit. That is the gate working. I reverted rather than
route around it, then read the amendment history and followed the established
route.

## Open questions: 3

1. **Set `ANTHROPIC_API_KEY` in Azure?** Still unset, third cycle running. Nothing
   is classified in production, so this screen will show every reply as "Not
   checked yet" — correctly routed, but unsorted. The screen says so in plain
   words rather than looking broken. Yours, because it is money.
2. **Who reads the price list?** `WebFetch`, `WebSearch` and the `claude-api`
   skill were **all denied again this cycle**, as in 85 and 86. Three cycles, three
   denials — this is an environment block, not something the next cycle will
   solve by trying harder. The rates remain unverified and the spend screen still
   says "Do not invoice these amounts yet". Someone with a browser needs two
   minutes on docs.claude.com; it is the only thing between the ledger and a real
   invoice.
3. **Should the daily digest carry the "want to talk" count?** The queue's
   ambition is "within minutes", and a screen only routes to somebody already
   looking at it. Adding a line to the digest would close that — but the digest
   sends real email, which is rule (c), so I did not touch it. Cheap to add on
   your word.
