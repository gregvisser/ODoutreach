# Screen walk, part 1 of 2 (row 135, cycle 195) — Replies, Clients, New Client, Universe, Blocked Contacts

**This row measures only. Nothing below was fixed, and no application code, schema, or
copy was changed.** No email was sent and no real client data was touched. Each finding
worth acting on is raised as its own queue row (150–153) rather than being fixed here.

## How this walk was done, and what it did not reach

The 30 August walk (`docs/ops/2026-08-30-screen-walk-findings-row111.md`) drove
`e2e/screen-walk.spec.ts` — a signed-in Playwright pass against a real local production
build — across 32 top-level screens. It explicitly did not reach three nested detail
routes: a contact list's own page, an outbound/inbound message's own page, and a linked
reply's own page. This row's job was to close that gap and re-verify the five open
confusion findings row 111 left un-fixed, three of which have since been fixed by other
rows.

**This walk was a source-code read, not a fresh live click-through.** No new Playwright
spec was written and the app was not run in a browser this cycle. Reasons: (1) row 134
(cycle 192), the row immediately before this one, answered its four questions "from the
code and the screens" and was accepted as done on that basis — this row follows the same
established method; (2) extending `e2e/screen-walk.spec.ts` and its fixture seed to cover
three new nested routes (a list needs contacts in various states, a message needs a real
inbound thread, a reply needs a linked sequence enrollment) is itself a build task with
its own review surface, which this row is explicitly forbidden from doing; and (3) the
five-area scope named in this row is large enough that a full live walk risked not
finishing inside one cycle. For every finding below, the exact on-screen copy is quoted
verbatim from the JSX/TSX source and the computing logic is traced to source, file and
line — the same standard of evidence row 111 used, just gathered by reading rather than
by rendering.

**What this specifically means was not verified:** whether a real browser actually
paints these exact strings (a build-time typo or a runtime-only branch not visible in
static reading), and whether any client-side JavaScript error would silently break a
control that looks correctly wired in source. Six parallel researchers each covered one
area of this row's scope and their findings were spot-checked against source directly
(two of the highest-severity claims below were independently re-confirmed) before being
included here.

**Not reached at all, and why:** support tickets (`src/app/(app)/support/`, including the
`[ticketId]` detail route) are named in the 30 August artefact as an uncovered nested
route, but that route is explicitly in row 136's scope (Part 2 of this same walk, which
lists `support/` among its routes), not this row's five named areas. It is not walked
here to avoid the two rows duplicating each other's work.

## Findings, ranked by how much damage each causes a real operator

### 1. A reply an operator has already marked "handled" can still be answered a second time from a different screen, because one screen's "handled" state was never taught to read the other's

**Screens:** `/clients/{client}/activity/replies/{replyId}` (reply detail) and
`/clients/{client}/activity/messages/{messageId}` (message detail) — both real,
click-reachable paths to the same conversation.

Row 132 (cycle 168) added a durable `InboundReply.handledAt` field and taught two
queries to treat a reply as handled if *either* that field or the older
`InboundMailboxMessage.metadata.handling.handledAt` signal is set — the `/replies` queue
(`src/server/queries/replies-needing-a-person.ts:174-177`) and the client Activity tab's
Replies panel (`src/server/queries/client-outreach-replies.ts:190-197`). It was not
applied everywhere the two signals meet:

- `loadClientLinkedReplyDetail` (feeds the reply-detail page,
  `src/server/queries/client-linked-reply-detail.ts:103,187`) reads `reply.handledAt`
  only — no fallback to the mailbox-message signal.
- `loadInboundMessageDetailForClient` (feeds the message-detail page,
  `src/server/inbox/inbound-message-detail.ts:86`, via
  `readHandlingStateFromMetadata`) reads the mailbox-message metadata only — never
  looks at `InboundReply.handledAt`. Confirmed directly in source for this artefact.
- Clicking **"Mark handled"** on the reply-detail page
  (`src/server/inbox/mark-reply-handled.ts:55-58`) writes only to `InboundReply`;
  replying or marking-handled from the message-detail page
  (`src/server/inbox/mark-inbound-message-handled.ts:47-55`,
  `src/server/inbox/reply-to-inbound-message.ts:438-452`) writes only to the mailbox
  message's metadata.

**Concrete failure:** an operator opens the reply-detail page, reads the reply, clicks
**Mark handled**. It correctly drops off `/replies` and the Activity panel (both OR the
two signals). The same conversation is also reachable at the message-detail page —
directly from the reply-detail page's own **"Open inbox view to reply →"** button
(`src/components/activity/client-linked-reply-detail.tsx:241-246`) — where the badge
still reads **"Unhandled"** with a live **Send reply** button, nothing telling the reader
a colleague already closed it out. A second operator can send a genuine duplicate reply
to a real prospect. It fails in the other direction too: replying from the message page
clears the aggregate queue and panel but leaves the reply-detail page's own
`ReplyOwnershipCard` still reading "Unclaimed" with live Claim/Mark-handled buttons,
contradicting what the rest of the product now says. The message-detail page also does
not use the shared `ReplyOwnershipBadge` component at all — it hand-rolls its own badge
with different wording ("Unhandled" vs "Unclaimed", no claimed state) and a separate
`ReplyClaimNotice` banner that never names the viewer.

**Why this is worst on this list:** it is the one finding here with a direct path to a
duplicate real email reaching a real prospect — the exact damage category row 132 itself
was raised to close, in a corner row 132's own fix did not reach. Raised as row 150.

### 2. The Sources import screen tells an operator a contact without an email will still be saved — it will not; the row is silently dropped

**Screen:** `/clients/{client}/sources`.

**Exact words on screen** (`src/app/(app)/clients/[clientId]/sources/page.tsx:111-114`):
*"Fields can be empty. A contact must have at least one of email, LinkedIn, mobile, or
office number to be saved. Today, email is still required to deliver outreach."*

**What a new operator would reasonably conclude:** a LinkedIn-only or phone-only row
gets imported and saved into the list — it just cannot be emailed yet — so importing a
list sourced mostly from LinkedIn is safe and nothing is lost.

**What is actually true, confirmed directly in source for this artefact:**
`EMAIL_REQUIRED_FOR_PERSISTENCE = true` (`src/lib/contact-import-contract.ts:54`, with
its own doc comment: *"this importer still requires a usable email to persist rows"*).
A row with no usable email is never written to the database at all — not saved-without-
outreach as the on-screen copy says, but silently absent from the imported list, with no
row-level warning on this screen naming which contacts were dropped or why.

**Why this ranks second:** this is the same underlying gap row 134/cycle192 already
found in the training module (raised as row 148, finding 2) — but this is the live
import screen an operator actually uses on every real import, not a training document
they may or may not have read. An operator relying on this screen's own words would
believe a LinkedIn-sourced batch imported cleanly when a portion of it silently did not,
with no on-screen count to catch the gap. Raised as row 151, and its fix should also
close row 148 finding 2's training-copy instance of the same false claim so the two
don't drift again.

### 3. A contact list's own detail page has no actions, doesn't say it's read-only, and has no path forward to building a sequence with it

**Screen:** `/clients/{client}/lists/{listId}` — never walked before this row.

This page renders ten summary counts and a full per-contact status table, and that is
all: the only clickable element on the entire page is the "Sources" breadcrumb link
(`page.tsx:81-86`). There is no button to add or remove a contact, export the list,
archive it, or start a sequence from it. The Contacts tab one level up explicitly says
*"This page is read-only"* with a link onward
(`src/app/(app)/clients/[clientId]/contacts/page.tsx:392-393`); this page, which is even
more restrictive, says nothing of the kind — a first-timer arriving here (e.g. from the
Contacts tab's own "Open" link) has no signal that inaction is expected, and no signal of
where to go to act on what they're looking at.

This also independently reinforces row 146 (raised by row 134/cycle192): that row found
Universe's list-creation success message has no forward link to building a sequence.
This list's own permanent home page has the identical gap, worse — it is not a one-time
missed message but a standing absence on the screen an operator would return to every
time they check the list.

**A smaller, second defect on the same page:** the expanded contact row's "Subject"
field falls back to the sending mailbox's email address when no subject preview exists
(`subject: ss?.subjectPreview ?? outbound?.mailbox?.email ?? null`,
`src/server/queries/client-contact-list-detail.ts:297`, rendered under the label
"Subject" in `src/components/lists/list-detail-contact-table.tsx:365`). A contact row
without a captured subject preview would show something like *"Subject:
sales@client.com"* — a mailbox address masquerading as an email subject line, reading as
a data bug to whoever expands that row.

Raised as row 152: add a plain-English read-only statement, a "Build a sequence with
this list" link (closing this page's own gap and reinforcing row 146), and fix the
Subject fallback to say nothing captured rather than substitute the mailbox address.

### 4. The new-client creation form promises a setup order that contradicts the real checklist shown right after creation

**Screen:** `/clients/new`.

**Exact words on screen** (`src/app/(app)/clients/new/onboarding-form.tsx:170-178`): an
"After create" box states the order as **Brief → Mailboxes → Sources → Suppression →
Contacts → Templates → Sequences → Activity.**

**What is actually true:** the client workspace's own subnav code comment states the
opposite order deliberately — *"Suppression comes before import in the funnel: attach
the client's Do-not-contact sources first, then import contacts via Sources/Lists"*
(`src/components/clients/client-workspace-subnav.tsx:44-45`) — and the real
post-creation checklist shown on the client Overview page the moment a new client is
created (`src/lib/clients/getting-started-view-model.ts:70-145`) has 8 steps — Brief,
Mailboxes, Suppression, Contacts, Templates, Sequences, Enrollments, Launch — with no
"Sources" step and no "Activity" step at all, both in a different order and a different
count than what the creation form just told the operator to expect.

**Why this ranks lowest of the four raised:** nothing is mis-wired — every step
individually works — this is a pure copy mismatch. But it is the very first thing a
brand-new operator reads, and the very next screen they see visibly disagrees with it,
which is exactly the kind of small contradiction that erodes trust in a product on
someone's first use of it. Raised as row 153: correct the "After create" text to match
`getting-started-view-model.ts`'s real 8 steps.

## Findings re-verified from row 111, and their current state

Three of row 111's five findings that fall inside this row's scope have been fixed by
other rows since 30 August (all in commit `f462914`, "row 112 — fix all 7 row-111
confusion findings," PR #439, and commit `9b109c8`/cycle 191 for templates):

- **Row 111 finding 2** (per-client Do-not-contact tab's sync banner contradicted its
  own "Sheet connected" cards) — **fixed.** The banner now branches on whether this
  specific client has synced before (`suppressionSyncUnavailableCopy`,
  `src/lib/suppression/staff-labels.ts:71-84`) instead of a flat global-only check, and
  the "connected" badge now uses the same `suppressionSourceIsConnected` test as the
  Overview readiness row, so the two can no longer disagree. Confirmed against current
  source for this artefact.
- **Row 111 finding 5** (templates "IN REVIEW — Legacy status" with no statement of
  usability) — **fixed.** Every status tile and every row now carries an explicit
  Usable/Not usable badge with a consequence sentence
  (`src/components/clients/email-templates/client-email-templates-panel.tsx:120-147`),
  and row 130's archive/delete and row 133/cycle191's sequence-structure grouping are
  both confirmed live and wired, not orphaned.
- **Row 111 finding 1** (Launch banner always said "queued" regardless of whether the
  send had already gone out) — **fixed.** `sendClientEmailSequenceIntroductionAction`
  now re-reads each row's real post-dispatch status and reports "sent," "queued —
  sending shortly," or "failed to send" accordingly
  (`src/lib/clients/outreach-sequence-send-staff-copy.ts:141-172`).

**Row 111 finding 3** (client Overview said do-not-contact was "Not configured" for a
client whose own tab showed active sync) is also fixed by the same commit — Overview and
the per-client tab now use the identical `spreadsheetId`-based test.

**Row 111 finding 4** (Overview's "Lists" row is actually a contact count, not a list
count) is **partially addressed, not closed.** The same commit added an explicit
`contactNoun` so the number now reads "1 contact total · 1 eligible" instead of a bare
"1 total · 1 eligible" — genuinely less misleading — but the row's own label is still
"Lists," and its own in-code comment
(`src/lib/client-launch-state.ts:232-238`) states this was a deliberate choice to keep
the label matching the subnav tab name rather than renaming it. The structural mismatch
(a row titled "Lists" that measures contacts, next to a Lists tab that can independently
say "No contact lists yet") is still capable of misleading a first-timer who reads the
label rather than the number. Not raised as a new row here — it has already been
triaged once and left as a deliberate trade-off — but recorded here so the decision is
visible rather than silently re-discovered.

A residual, lower-severity analog of finding 2 was found on the **global** Blocked
Contacts screen (`/suppression`) that row 111 did not examine: its "sync isn't set up"
banner still uses the flat global-only check with no prior-sync awareness
(`src/app/(app)/suppression/page.tsx:195-225`). It is materially less damaging than the
original because it sits inside a collapsed `<details>` a reader must deliberately open,
not an always-visible headline banner. Not raised as its own row — logged here for
completeness; fold into row 152 or a future suppression pass if it is ever touched again.

## Screens walked, by area

**Replies:** `/replies` (fine — no findings), client Activity tab (fine on its own —
uses the correctly-reconciled ownership signal), message detail (finding 1), reply
detail (finding 1).

**Clients:** clients list (fine — every link real, empty states correctly branch
between "no clients exist" and "none visible to you"), client Overview (fine on its
core controls; see row 111 finding 4 status above), the ten-tab workspace subnav (all
ten tabs resolve to a real route — no dead tab), the loading skeleton (trivial, fine),
Brief tab (fine — live progress bar, "Up next" field, working jump links; the brief
form itself was not opened in this pass).

**New Client:** `/clients/new` (finding 4), the legacy `/clients/{id}/onboarding` route
(confirmed a deliberate redirect to Brief, not a dead end — nothing links to it
directly), the real post-creation landing (client Overview's success banner + an
8-item linked "Getting started" checklist — clear and unambiguous), Setup-help (fine —
explicitly written for a non-technical operator to forward verbatim, with real
non-blank empty states for a client with no mailbox and no website yet).

**Universe:** `/universe` (fine — one small label overreach: an empty-state link reads
"Sources" but lands on the client picker, not a specific client's Sources tab
directly), lists/{listId} detail (findings 3), Contacts tab ("Lists & readiness," fine
— explicitly marks itself read-only, unlike the list detail page it links to), Sources
tab (finding 2).

**Blocked Contacts:** `/suppression` global (fine — see residual note above), per-client
Do-not-contact tab (fine — row 111 finding 2 confirmed fixed; the shrink-guard flow that
protects against silently un-blocking addresses on a shrinking sheet sync is
deliberately conservative and well-worded).

## New rows raised

- **Row 150** — fix the reply-ownership desync between the message-detail page, the
  reply-detail page, and the two aggregate views (finding 1). Highest priority: real
  duplicate-send risk to a prospect.
- **Row 151** — correct the Sources import screen's false claim that email-less contacts
  are saved without outreach, and close the matching training-copy defect already
  tracked as row 148 finding 2 in the same fix (finding 2).
- **Row 152** — give the list detail page a plain-English read-only statement, a
  "Build a sequence with this list" link, and fix the Subject-field mailbox-address
  fallback (finding 3).
- **Row 153** — correct the new-client form's "After create" setup-order copy to match
  the real 8-step post-creation checklist (finding 4).

## Data created this cycle

None. This was a read-only source-code walk; no contact, list, or sequence was created
in `bidlowai` or any other workspace, and no e2e/dev-route calls were made.

## Gates run for this row

No application code, schema, or copy changed, so nothing new exists for
lint/typecheck/the unit suite to catch — run anyway per this row's Definition of Done,
to confirm this cycle's own actions (reading source, writing this file, editing
`QUEUE.md`) left the tree exactly as clean as it started:

- `npm run lint` — see cycle log for output.
- `npm run typecheck` — see cycle log for output.
- `npm test` — see cycle log for output.
