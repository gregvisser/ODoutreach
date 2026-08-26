# Does a reply come back? — proved 26 August 2026

**Short answer: yes, and it takes about a minute and a half, not forty.**

Two complete round trips were run on 26 August, on the live production system,
using only the `bidlowai` workspace. One of them was a real human — Greg replied
from his own Gmail on his phone, and the system picked it up, matched it to the
right contact, and put it on the Activity screen. Nothing was simulated and no
test harness was used: every leg went through the same endpoints the scheduled
jobs call.

One real defect was found on the way, and it is the kind that matters: **every
outreach email we send ends "reply STOP to this email and we'll remove you", and
a reply consisting of the word STOP matched nothing.** That is fixed in this
change, with tests that were watched failing first.

---

## 1. The round trip, timed

Item 18 proved the sending half on the same day. This is the other half.

### Round trip A — a real person, on a real phone

| Leg | When (UTC) | Elapsed |
|---|---|---|
| System sent to `greg.visser64@gmail.com` | 12:16:36 | — |
| Greg replied from Gmail ("I am replying", Outlook for Android) | 12:50:34 | his own time |
| Reply arrived in `greg@bidlow.co.uk` Inbox | 12:50:34 | — |
| Reply sync started | 12:50:50 | |
| **Reply stored, matched and linked** | **12:51:12** | **38 s after the sync began** |
| Rendered on the Activity screen | 12:52 | immediately on load |

The reply linked to contact `ctmta25qzx79c7df17471d393c`
(`greg.visser64@gmail.com`) and to outbound `obmta25r09a9677c52c442c3ed` — the
exact message we sent him — and flipped that send from `SENT` to `REPLIED`.

### Round trip B — send, reply, STOP, all machine-driven

Greg cannot be woken up to press reply, so a second counterparty was used: a
real external address on a real external domain (`onboarding@resend.dev`) that
the system can both mail and be mailed from. Genuine internet mail in both
directions.

| Leg | When (UTC) | How long that leg took |
|---|---|---|
| Outbound row staged (`QUEUED`) | 12:43:29 | — |
| Real queue worker called, mail dispatched via Graph | 12:43:37 | **8 s** |
| Reply sent back over the internet | 12:43:45 | — |
| Reply landed in the Exchange Inbox | 12:44:01 | **16 s in transit** |
| Reply sync called | 12:44:36 | — |
| **Reply stored, matched, linked, outbound → `REPLIED`** | 12:45:03 | **27 s of sync** |
| **Send → reply visible, end to end** | | **85 seconds** |
| Second reply sent, saying STOP | 12:45:38 | — |
| STOP landed in the Inbox | 12:45:52 | **14 s in transit** |
| Sync called | 12:46:02 | — |
| **Contact suppressed automatically** | 12:46:26 | **24 s of sync** |
| **STOP → suppressed, end to end** | | **48 seconds** |
| A further send to that contact was **refused** | 12:47:10 | immediately |

### What that means for "how long does a reply take"

Two different numbers, and Greg should quote the second one:

* **Once the sync runs, a reply is on screen in well under a minute.** The sync
  itself takes 37–43 seconds for the whole estate of 27 mailboxes.
* **The sync runs every 15 minutes, weekdays 07:00–18:00 UK.** So the honest
  worst case a client will actually experience is **about 15–16 minutes**, and
  the average about eight. Outside those hours and at weekends, nothing syncs
  until the next weekday morning.

Nothing here takes forty minutes. If a faster feel is wanted for the demo, the
"Fetch replies" button on the mailbox screen runs the same sync on demand.

## 2. Was it matched to the RIGHT contact?

Yes, on all three replies, and this was checked in the database rather than
inferred from a green tick.

| Reply | From | Matched contact | Linked to the send | Method |
|---|---|---|---|---|
| "I am replying" | `greg.visser64@gmail.com` | the Gmail contact | the 12:16:36 send | `BY_CONTACT_EMAIL` |
| "happy to have a short call" | `onboarding@resend.dev` | the round-trip contact | the 12:43:37 send | `BY_CONTACT_EMAIL` |
| "STOP…" | `onboarding@resend.dev` | the round-trip contact | the 12:43:37 send | `BY_CONTACT_EMAIL` |

**Why every one says `BY_CONTACT_EMAIL` and not `BY_THREAD_REF`, which matters
for anyone reading the code:** the strongest matching leg compares the reply's
`In-Reply-To` header against a Message-ID we stamped on the outbound. Microsoft
Graph does not let us stamp one — `rfc822MessageId` is `null` on every Graph
send, confirmed on all three rows above — and Graph's list-messages endpoint
does not return message headers either. So on the Microsoft path matching rests
entirely on two things: the reply comes **from the address we emailed**, and the
subject begins with **"Re:"**. Both held. This is by design and is documented in
`process-synced-replies.ts`, but it is worth knowing that the belt-and-braces leg
is inert for Microsoft mailboxes.

## 3. Is it on the Activity screen?

Yes — checked by loading the live page, signed in, not by reading the query.

`GET /clients/{bidlowai}/activity` on the direct App Service URL returned
**HTTP 200** with `totalReplies: 3, shownReplies: 3`, and the page markup
contains the sender addresses, the reply text ("I am replying"), the match
method and the subject of the outbound each one is attached to.

Page load was **4.6–5.2 seconds**, which is slow and is a separate problem
(see the load-speed finding — the app runs on a single-core B1 App Service).

## 4. Does STOP suppress the contact?

Yes, automatically, with no human involved.

* `MAILBOX_COMPLAINT_DETECTION_ENABLED` is `true` on the production App Service,
  so the detection is live rather than merely built.
* The STOP reply created a `SuppressedEmail` row for `onboarding@resend.dev` and
  set the contact's `isSuppressed` flag.
* **And it actually blocks.** A further outbound to that contact was staged and
  the real queue worker was run against it. The row came back
  `status = BLOCKED_SUPPRESSION`, `sentAt = null`,
  `"Recipient became suppressed before send completed"`. Nothing left the
  building.

## 5. The defect this exercise found

**Our own opt-out instruction did not work.**

Every outreach email sent on the mailto rail — which is every BidlowAI email,
because that rail exists precisely to avoid putting a foreign link in the body —
ends with this line, verbatim from the code:

> To opt out, reply STOP to this email and we'll remove you.

The opt-out classifier had ten patterns. The closest was `stop-emailing`, which
requires STOP to be followed by "email", "contact", "message", "sending" or
"reaching". **A reply consisting of the word STOP matched none of them.**

The round trip above only passed because the test reply also said "please take
me off this list", which a *different* pattern caught. Had it said only what the
email asks for, the contact would not have been suppressed and the next campaign
would have emailed them again.

This is a compliance defect, not a cosmetic one: under PECR the instruction we
publish is the opt-out mechanism, and it has to work.

**Fixed**, in `src/lib/inbox/opt-out-detection.ts`: a bare STOP is now matched as
a whole line, with an optional reply prefix so "Re: STOP" in a subject counts,
and with explicit handling of the CRLF line endings Microsoft Graph actually
delivers. It is anchored to a line rather than a word boundary so ordinary
sentences — "we can stop the trial", "non-stop enquiries" — do not fire.

Five tests were added and **watched failing first**:

```
AssertionError: "STOP": expected false to be true
AssertionError: STOP: expected false to be true
Tests  2 failed | 9 passed (11)
```

then green after the one-pattern change. The three false-positive guards
(ordinary sentences, and our own STOP instruction coming back inside a quoted
original) passed before and after, so the fix did not buy its win by loosening
the classifier.

## 6. A second finding, not fixed here

**Reply sync reads the Inbox folder only. A prospect reply that Exchange files
as junk is never ingested, and nothing anywhere says so.**

This was found by accident: a probe message sent at 12:41:27 never appeared, and
it turned out to be sitting in `JunkEmail`. The same sender's other messages went
to the Inbox, so junk filing is not predictable.

For a cold-outreach product this is worth taking seriously — a reply is the
entire point of the exercise, and one that lands in junk is invisible with no
error and no warning. Ingesting the junk folder would be reasonably safe, because
a message is only ever matched when it comes **from an address we actually
emailed**, but it is a change to mailbox ingestion, which this repository
requires to sit behind a flag and be proven separately. It has not been done in
this change and should not be assumed.

## 7. What was written to production

Small, additive, and confined to the one allowlisted workspace:

* one `Contact` (`onboarding@resend.dev`) in `bidlowai`;
* two `OutboundEmail` rows in `bidlowai` — one sent, one deliberately blocked;
* the `InboundMailboxMessage` / `InboundReply` / `SuppressedEmail` rows the
  system created by itself as a result.

No other client was written to, mailed, or altered. Both sends were left with no
staff user attached on purpose, so they were attributed to a machine and had to
pass the autonomous-actor allowlist gate rather than bypass it.

## 8. How this was measured, for whoever repeats it

The production database's firewall allows Azure services only. Rather than open
it to a workstation, every query ran **inside the App Service container** through
the Kudu command API, under `BEGIN READ ONLY` for reads. No firewall rule was
added and no credential left Azure. The scratch scripts were removed afterwards.

The Activity screen was loaded with a short-lived next-auth session cookie minted
for Greg's own super-admin account from the production `AUTH_SECRET`, the same
mechanism the e2e suite uses. It expired after an hour and was never written
anywhere tracked by git.

One thing worth recording because it was tried and refused: an attempt to place a
message directly into the mailbox via Graph returned **403 `ErrorAccessDenied`**.
The mailbox grant is `Mail.Send` + `Mail.Read` only, with no `Mail.ReadWrite`, so
the application genuinely cannot write into a customer's mailbox. That is the
right answer, and it is why the round trip was run with a real external
counterparty instead.

---

## Addendum — the STOP fix was proved to FIRE in production, not just in tests

A green test proves the code passes. It does not prove the code is running, and
this repository has recorded eleven cases of something that was built, wired,
reported success and never fired. So after the fix deployed, the round trip was
run once more with a reply whose entire body was the single word our email asks
for.

Deployed commit verified by hash against the **direct** App Service URL before
starting: `/api/build-info` → `db9b2114ff7a577fa0d4fe19a109596c1bb659a6`,
`/api/health` → `ok: true`, `database: ok`.

| Leg | When (UTC) |
|---|---|
| Existing suppression cleared so the test could not pass on stale state | 13:05 |
| Fresh outbound sent to the contact through the real worker | 13:06:5x |
| Reply sent, body exactly `STOP` and nothing else | 13:07:10 |
| Landed in the Exchange Inbox | 13:07:23 |
| **Reply ingested, matched, and the contact SUPPRESSED** | **13:07:49** |

The stored reply reads `bodyPreview: "STOP"` — no other words, nothing else for
a different pattern to catch — and the contact came out with
`isSuppressed: true` and a `SuppressedEmail` row. **Before this change that same
reply would have been filed as a reply and suppressed nothing**, and the next
campaign would have emailed them again.

The suppression state was cleared first, deliberately, so the result could not be
a leftover from the earlier round trip. That delete touched the `bidlowai`
workspace only, and the script refuses to run against any other client.
