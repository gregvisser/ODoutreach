# Can an operator actually launch a sequence through the screens? — walked 29 August 2026

**Short answer: no. The walk got further than any previous one — a real template,
a real imported contact, and a real sequence were built through the actual
screens, and the sequence reached "Ready to launch" — but every real launch
attempt was refused at the last step, by the app itself, before any email left
the building. Nothing was sent. The refusal is a genuine, reproducible product
defect, and it is now named below rather than worked around.**

This is the first time anyone has driven this journey through the screens
rather than staging a row directly in the send queue. `docs/ops/SEND-PROOF-2026-08-26.md`
proved mail can leave the system; it did so by writing an `OutboundEmail` row
directly, which never touches the code path below. This walk is what finds the
defect that method cannot see.

Deployed commit verified by hash before starting, on the **direct** App Service
URL: `/api/build-info` → `e318a782277c52257935f675bd0da257a5003ff4`,
`/api/health` → `ok: true`, `autonomousRelay.allowlistedClients: 1` (BidlowAI
only, unchanged).

---

## 1. What was actually clicked, in order

All of this was done signed in as staff (a short-lived next-auth session, the
same minting mechanism the e2e suite and the 26 August proofs use), against
production, in the `bidlowai` workspace only.

| Step | Screen | Action | Result |
|---|---|---|---|
| 1 | `/clients/{bidlowai}/templates` | Filled Template name / Category (Introduction) / Subject / Content, clicked **Save template** | Template created, auto-approved (no unknown placeholders) |
| 2 | `/clients/{bidlowai}/sources` | Uploaded a one-row CSV (`A Emails`, `Name`), **Preview**, then **Confirm import** | New contact list created, one contact enrolled |
| 3 | `/clients/{bidlowai}/outreach` | Expanded **New sequence**, named it, picked the new list and template for the Introduction step, clicked **Save sequence** | Sequence created, status Draft |
| 4 | Sequence detail | Clicked **Include new recipients** (or found it already auto-enrolled — save triggers `autoPrepareSequenceForLaunch`) | 1 recipient, PENDING |
| 5 | Sequence detail, "Live sends" | Clicked **Review recipients** (the separate `prepareClientEmailSequenceStepSendsAction` refresh, distinct from step 4's enrollment button) | "Ready now: 1" |
| 6 | Sequence detail | Clicked **Launch sequence**, confirmed the dialog (phrase `SEND INTRODUCTION` auto-injected by `SequencePhraseConfirmLaunch`, exactly as the code requires) | **Refused** — see below |

Two full passes were run end-to-end, with two different real recipients, to
rule out a contact-specific cause before concluding this is structural:

* **Pass A** — recipient `greg.visser64@gmail.com`. This address had a real
  outreach email sent to it on 26 August (`SEND-PROOF-2026-08-26.md`), so it
  was inside the standing outreach cooldown. Step 5 initially showed
  "Ready now: 0" with "Not ready to launch yet"; checking **Re-engage (bypass
  cooldown)** before Review recipients flipped it to "Ready now: 1" — a real,
  correct screen control for exactly this case. Launch was still refused.
* **Pass B** — a second, never-before-contacted address
  (`greg.visser64+cycle105@gmail.com`, a Gmail plus-alias — a fresh identity
  for suppression/cooldown purposes, delivering to the same inbox Greg
  actually owns). No cooldown, no re-engage needed, "Ready now: 1" on the
  first Review recipients click. **Launch was refused with the identical
  message.**

Two different contacts, two different enrollment paths, the same refusal —
that rules out the contact and rules in the sequence's own send-time
composition.

## 2. The exact refusal

Every launch attempt returned, on-screen, in the "Live sends" card:

> **Cannot launch**
> 1 recipient blocked: Composition lost send-readiness between planning and
> dispatch; re-plan.

And the top-of-page banner: `No introductions queued. 0 introductions queued.`

## 3. Root cause, traced in the code that is actually deployed

`src/server/email-sequences/send-introduction.ts:1084-1115` re-renders the
email at the moment of dispatch (`composeSequenceEmail`) rather than trusting
the "Ready" count computed a moment earlier by "Review recipients" — a
deliberate design choice, per the comment at line 1084-1086 ("we re-render to
ensure the actual sent bytes match what we class-checked seconds ago"). If
`composition.sendReady` is false, the row is pushed to `blocked` with exactly
the message above and no `OutboundEmail` row is ever created.

`composeSequenceEmail` (`src/lib/email-sequences/sequence-email-composition.ts:250-317`)
requires five fields non-empty to be send-ready, one of which is
`unsubscribe_link`. That value is built at
`src/server/email-sequences/send-introduction.ts:559-584` as follows:

* `alignedLinkBaseUrl = resolveClientLinkBaseUrl(client)` — **null** for
  BidlowAI (no verified sender-aligned link domain, confirmed already in the
  26 August proof).
* Because that is null, `unsubscribeUrlForSend` falls back to
  `fallbackUnsubscribeLink = buildUnsubscribePlaceholder(client.defaultSenderEmail)`.
* `buildUnsubscribePlaceholder` (line 263-268): **returns `""` if
  `clientDefaultSenderEmail` is falsy.**
* **`BidlowAI`'s `Client.defaultSenderEmail` is null.**

So `unsubscribeUrlForSend` is `""`, `buildSenderRow` turns that into
`unsubscribeLink: null` (line 303: `unsubscribeLink.length > 0 ? unsubscribeLink : null`),
and `composeSequenceEmail` marks `unsubscribe_link` missing → `sendReady: false`
→ blocked, every time, for every contact, regardless of cooldown or list.

**Why "Review recipients" never catches this:** the prepare-time eligibility
check (`prepareClientEmailSequenceStepSendsAction` /
`planSequenceStepSends`) does not run the full `composeSequenceEmail` check —
only the real dispatch path in `sendSequenceIntroductionBatch` does. There is
even a comment acknowledging a version of this gap at line 574-577 of the same
file ("the real sender email and unsubscribe URL are set per-recipient inside
the dispatch transaction... we mirror the planner fallbacks") for a
*placeholder* copy of the sender row used only for an earlier plan-time
re-check (line 569-584) — but that placeholder patch is never applied to the
real `senderRowForSend` built at line 1067, which is the one that actually
reaches `composeSequenceEmail`. That asymmetry is why the screen can show
"Ready now: 1" right up until the moment of the real send.

**There is no screen anywhere in the product that sets `Client.defaultSenderEmail`.**
Searched every reference to the field in `src/app` and `src/server`
(`defaultSenderEmail` appears only in `select`/read contexts — mailboxes page,
setup-help page, operations page, send/compose code). It is written only by
`prisma/seed.ts` and, presumably, by hand at provisioning time for other
clients. **An operator cannot fix this from the app, at any permission level,
today.**

This almost certainly explains why every previous BidlowAI proof
(`SEND-PROOF-2026-08-26.md`, `REPLY-PROOF-2026-08-26.md`) staged an
`OutboundEmail` row directly rather than launching a sequence: the sequence
path has been broken for this workspace the whole time, and nobody had walked
it through the screens to find out until now.

## 4. What this walk did NOT touch, and what left the building

**Nothing was sent.** Both blocked attempts failed inside the dispatch
transaction *before* any `OutboundEmail` row is created (the `blocked.push(...)`
branch runs ahead of `tx.outboundEmail.create(...)` at line 1136) — confirmed
by reading the code, not just inferred from the screen. Independently
confirmed on the Activity → Troubleshooting tools → Outbound queue panel:

| | Before this walk | After this walk |
|---|---|---|
| QUEUED (global, all clients) | 0 | 0 |
| PROCESSING (global) | 0 | 0 |
| FAILED (BidlowAI, all-time) | 55 | 55 (unchanged) |

The global QUEUED count was read (read-only "Refresh queue status") before
every launch attempt and confirmed still 0 afterwards both times — this walk
never reached the point of clicking "Process queued emails" or triggering the
cron, because there was never a queued row of its own to safely process. That
button (and the global-drain risk it carries — it processes **every** client's
queue, not just BidlowAI's) was deliberately never used this cycle.

**The reply leg was not attempted**, because there was nothing to reply to.
Separately, and worth recording since it was investigated: this autonomous
cycle has no way to author a genuine external reply even if a send had gone
out. There is no human available to physically reply from a phone (the 26
August "Round trip A" needed Greg to do that by hand); `RESEND_API_KEY` and
`RESEND_WEBHOOK_SECRET` are still absent from production (confirmed again
today) so the `onboarding@resend.dev` round trip from 26 August's "Round trip
B" cannot be repeated from here; and the Azure CLI session available in this
environment (`az account get-access-token --resource https://graph.microsoft.com`)
carries only `Application.ReadWrite.All` / `Directory.AccessAsUser.All`-class
management scopes, no `Mail.Send`, so it cannot send a reply as any mailbox
either. BidlowAI has exactly one connected mailbox
(`greg@bidlow.co.uk`), so there is no second in-workspace mailbox to complete
a two-mailbox round trip the way the app's own send pipeline could reach both
ends honestly. None of this is new information this cycle discovered by
itself, but it is now recorded against this specific attempt rather than left
implicit.

## 5. A pre-existing "Ready" sequence was found, and deliberately left alone

BidlowAI already had one other sequence, `BidlowAI — audit-led intro, Aug
2026`, showing status "Ready" with 1 recipient. Before touching anything, its
recipient was checked (`/clients/{bidlowai}/lists/...`): **Lucy Gillett,
`lucysg@opensdoors.co.uk`** — a real, named OpensDoors colleague, not a test
address. Launching that sequence to complete this walk quickly would have
emailed a real named person an unsolicited "outreach" message without their
knowledge, for a test. That is outside what the hard rule permits in spirit
even though it is technically inside the `bidlowai` workspace boundary, so it
was left untouched. This is worth a human decision at some point — either that
sequence is real client work OpensDoors intends to send, in which case it
should be launched deliberately, not accidentally by a future test; or it is
leftover test data that should be cleared.

## 6. What this walk leaves behind in the workspace

* One template (`Cycle 105 walk intro — 2026-08-29-cycle105`) — real, approved,
  harmless, reusable.
* Two contact lists imported via the real CSV path — harmless.
* One sequence (`Cycle 105 walk — 2026-08-29-cycle105`) — the Pass A one,
  left in place; it has attempted-launch history so the app's own "Delete or
  archive" control archives rather than hard-deletes it (kept for audit,
  exactly as its own on-screen copy says). The Pass B sequence (the fresh
  never-before-contacted contact) was a genuine draft with no send history and
  was hard-deleted through the same real "Delete or archive sequence" button.

Nothing here is a migration, a schema change, client data, or an email.

## 7. Re-score dimension 1

**Left at 8, exactly as instructed if the walk cannot be completed.** The
walk went further than ever before — an operator can now be shown, with
evidence, exactly how far the screens carry a real send before the app itself
stops it, and exactly why — but "send it" and everything after (watch it
arrive, reply, confirm the match) were not reached. A score that moved here
would be moving on the strength of "found the bug", not on the strength of
"the journey works", and Greg's instruction was explicit: let the number land
where it lands.

**Named plainly, what this walk did NOT cover:** the send, the arrival, the
reply, and the reply-matching confirmation. All four remain unproven through
the screens.

**What would unblock the next attempt**, in order of how directly it fixes
the root cause:

1. Set `BidlowAI`'s `Client.defaultSenderEmail` to `greg@bidlow.co.uk` (a
   one-row update — additive, not destructive, doesn't touch an existing
   value since it is currently null) — this alone should make the mailto
   unsubscribe rail resolve and let `composeSequenceEmail` pass. This needs a
   deliberate decision about whether it is done by hand once, or whether the
   product should grow an operator-facing screen to set it (today there is
   none, for any client) — a real product gap, not just a BidlowAI one, since
   any other client relying on the mailto fallback (no aligned domain) would
   hit the exact same wall the first time they tried a real sequence launch.
2. Or: give BidlowAI a verified sender-aligned link domain, which would set
   `alignedLinkBaseUrl` and bypass the mailto fallback entirely.
