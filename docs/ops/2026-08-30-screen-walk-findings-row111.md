# Screen walk findings — "would a new employee know what just happened?" (row 111, cycle 139)

**No dangerous mislabeled control was found.** Nothing on any screen walked
lets an operator send or delete something while its own label says otherwise.
Everything below is a *confusion* finding — a screen that would leave a
competent new operator with a wrong belief, not a screen that would let them
take a wrong action by mistake.

**This row measures only. Nothing below was fixed, and no application code,
schema, or copy was changed.** No email was sent and no client data was
mutated beyond what the existing e2e fixture already creates when the walk
runs. The `bidlowai` "Cycle 129 send-and-reply walk" sequence was not touched
and was not launched by this cycle.

## What was walked, and how many screens

`e2e/screen-walk.spec.ts` — the existing method named in the row, not a new
one — was re-run against a fresh local production build (`npm run build`,
then Playwright's own `npm run start`) as a signed-in super admin, against the
isolated e2e Postgres database on `:5434`. **32 of 32 screens passed** every
mechanical check the harness makes (no error page, no console error, no
uncaught exception, an `<h1>` present, no raw Markdown, load time under the
15s ceiling). The raw artefacts are regenerated at
`e2e/.artifacts/screen-walk/*.json` (32 files, one per screen) and are not
committed — same as every prior run of this spec.

That 32-screen pass is necessary but not sufficient: **all 32 checks are
mechanical (did it render, did it error), and none of them ask whether a
human could tell what had just happened.** This artefact is the judgement
pass on top: every one of the 32 screens' rendered text was read, and for
findings that named a specific number, label, or copy string, the relevant
source file was read to confirm what actually computes that number — not to
fix it, only to state the true cause plainly enough that whoever picks up
row 112 does not have to re-derive it.

**One real gap in the harness, named plainly:** the e2e fixture client has no
sequence in any state (Ready / Sent / Blocked), so `screen-walk.spec.ts`
cannot observe the Outreach tab's Launch button, its confirm dialog, or its
post-launch state at all — which is exactly the stretch Greg named as the
trigger for this whole row. To still walk that stretch with real evidence
rather than guessing, findings 1 was built by reading the **existing, already
on-disk** real-production walks of that exact screen —
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md` (drove the
screens up to "Ready to launch," did not click Launch) and
`docs/ops/SEND-PROOF-2026-08-30.md` (cycle 138, the one authorised real click
and its full before/after database proof) — cross-referenced against the
actual source that generates the copy those two documents quote verbatim.
No new click was made to produce this artefact; row 111 forbids that.

## Findings, ranked by how much damage the confusion does

### 1. The banner a new operator reads right after clicking Launch always says "queued" — even once the email has actually gone out

**Screen:** `/clients/{client}/outreach`, sequence detail panel, immediately
after clicking **Launch sequence** and confirming in its dialog.

**Exact words on screen** (quoted verbatim from the two real walks on file):
confirm dialog — *"Launch introduction sends? This queues real introduction
emails for up to 1 contacts now. Follow-ups are launched separately."*; the
trigger's own helper text — *"You will confirm in a dialog before anything is
queued."*; and the green flash banner the page redirects to immediately after
confirming — *"1 introduction queued"* (built in
`src/app/(app)/clients/[clientId]/outreach/sequence-actions.ts:596-641`).

**What a new operator would reasonably conclude:** "queued" means waiting —
the email has been accepted into a line but has not left yet, and they should
expect to come back later to see it go out.

**What is actually true:** cycle 138's real, authorised send against the
production `bidlowai` client (`docs/ops/SEND-PROOF-2026-08-30.md`) shows the
row moving `QUEUED → SENT` via Microsoft Graph in **about 1.2 seconds** — an
inline dispatch on the click itself, not a staged write picked up later by a
worker. By the time the redirect finishes and the operator's browser paints
that banner, the email has, in the overwhelming majority of cases, already
left. The word "queued" is not a live status read at render time — it comes
from `result.counts.queued`, a count of how many rows *this action* enqueued
during the click (lines 598-600), fixed the instant the batch function
returns. It will say "queued" every time, regardless of whether the send that
follows takes 1 second or 10 minutes. This is the literal scenario Greg
described: after clicking Launch, the one sentence on screen cannot tell him
whether anything has actually been sent.

**What it should say instead:** report the row's dispatch outcome, not its
intake state — e.g. "1 introduction sent" when dispatch has already
completed by the time the page renders, falling back to "1 introduction
queued — sending shortly" only when it genuinely has not dispatched yet.

### 2. On the Do-not-contact screen itself, one banner says sync "isn't set up," directly above two rows that say it is working

**Screen:** `/clients/{client}/suppression` (Do-not-contact tab).

**Exact words on screen:** an amber banner — *"Google Sheets sync isn't set
up yet / Ask an administrator to connect Google Sheets sync (a one-time
setup). Once it's on, you just paste a Sheet URL here."* — sitting directly
above two cards that each read *"Sheet connected."*, and further down a
"Connection status" block reading *"Emails · Last sync succeeded · 250
addresses on the list"* and *"Domains · Last sync succeeded · 3 domains on
the list."*

**What a new operator would reasonably conclude:** either that no sync has
ever been configured (per the banner), or that it is actively running and
protecting the client (per the two "succeeded" lines) — the same screen
answers its own headline question two different ways within a few lines of
each other.

**What is actually true (traced in
`src/components/clients/client-suppression-inline-card.tsx:162-183`):** the
amber banner is gated on one **global** credential
(`googleServiceAccountConfigured`, an app-wide env var), while "Sheet
connected" / "Last sync succeeded" reflects a **per-client** fact that a sheet
reference was saved and has synced before — and that fact does not disappear
if the global credential is later removed, rotated out, or never matches. The
two messages are answering different questions ("is the shared Google
credential live right now" vs "did this client's own sheet ever sync") and
the copy presents them as if they were the same yes/no.

**What it should say instead:** if the shared credential is currently
missing, say so **in relation to** what is shown below it — e.g. "Sync is
currently unavailable; the list below is frozen as of its last successful
sync" — rather than letting an unqualified "isn't set up yet" sit next to an
unqualified "succeeded."

### 3. The client Overview says do-not-contact protection is "Not configured" for a client whose own Do-not-contact tab shows it actively blocking hundreds of addresses

**Screen:** `/clients/{client}` (Overview) → Launch readiness panel, row
"Do-not-contact."

**Exact words on screen:** *"Do-not-contact — Not started — Not
configured."*

**What a new operator would reasonably conclude:** this client currently has
no do-not-contact protection at all, and needs it set up before it is safe to
launch.

**What is actually true:** the same client's own Do-not-contact tab (finding
2, above) shows two connected Google Sheets already blocking 250 email
addresses and 3 domains, both reporting "Last sync succeeded." Traced in
code: the Overview's count
(`suppressionSheetCount`, `src/lib/client-launch-state.ts:186-223`) only
counts suppression sources whose `spreadsheetId` field is non-blank
(`src/server/queries/client-workspace-bundle.ts:285`), while the Do-not-contact
tab's own "connected" badge (finding 2) only checks that a source row exists
at all, with no `spreadsheetId` requirement. The same underlying data, tested
two different ways in two different places, can legitimately disagree — this
is not a data problem, it is two different code paths asking two different
questions and both calling the answer "configured" or "not configured."

**What it should say instead:** use the same test in both places. If a
source really does have rows and a successful sync history but a blank
`spreadsheetId`, say that specific thing ("sheet reference missing — using
the last list synced before it went missing") rather than a flat "Not
configured" that contradicts the client's own dedicated screen for the same
fact.

### 4. Overview's "Lists" figure is a contact count, not a list count, and it disagrees with the client's actual Lists tab

**Screen:** `/clients/{client}` (Overview) → Launch readiness panel, row
"Lists."

**Exact words on screen:** *"Lists — Ready — 1 total · 1 eligible."*

**What a new operator would reasonably conclude:** this client already has
at least one contact list built and ready to attach to a sequence.

**What is actually true:** the same client's own Lists tab ("Lists &
readiness," `/clients/{client}/contacts`) reads *"TOTAL LISTS — 0 —
Contact lists attached to this client"* and *"No contact lists yet."* Traced
in `src/lib/client-launch-state.ts:234-236`, the "Lists" row's number is
`contactsTotal`/`contactsEligible` — a count of individual **contacts**, not
of lists — under a label that says "Lists." A client can have an eligible
contact seeded directly (as this one does) with zero actual lists, which is
exactly what is on screen here.

**What it should say instead:** label the row "Contacts," matching what it
actually counts, so the number can never be misread as "a list exists" when
the client's own Lists tab says otherwise.

### 5. A template status is called "IN REVIEW," described only as "Legacy status," with no statement of whether it can be used

**Screen:** `/clients/{client}/templates`.

**Exact words on screen:** the status-count tile — *"IN REVIEW — Legacy
status — open and save to refresh."*

**What a new operator would reasonably conclude:** unclear — "legacy" says
this status is old, but says nothing about whether a template sitting in it
today can be picked into a live sequence right now.

**What is actually true:** the screen never says. A new operator has no way
to predict, from the label alone, whether a template stuck "IN REVIEW" blocks
building a sequence or is simply a leftover value from an earlier version of
the product.

**What it should say instead:** state the consequence directly — e.g. "In
review — not selectable in a sequence until you open and re-save it" — so the
word "legacy" is not the only signal of whether the status matters today.

### 6. An outbound email's detail screen can show "Provider: mock" with nothing on the screen explaining what that means

**Screen:** `/activity/outbound/{id}` (Outbound email detail).

**Exact words on screen:** *"Provider — mock"*, with **Provider id** reading
*"—"*.

**What a new operator would reasonably conclude:** unclear — "mock" is a
developer word for a fake/test system, so a reader could reasonably worry
this specific email was never really sent at all, for any client.

**What is actually true:** per the Training module for Mailboxes
(`/training/mailboxes`), "the noreply@ placeholder and mock transport apply
only to legacy or test rows that have no mailbox attached" — real client
outreach always goes through a connected mailbox and shows a real provider
and provider id. That explanation exists in the product, but on a different
screen than the one showing the confusing word, so a reader would have no
reason to go looking for it.

**What it should say instead:** replace "mock" with a plain, on-screen
description ("Internal/system email — not sent through a client mailbox")
directly where the term appears, rather than relying on a reader having
already read an unrelated training page.

### 7. The same unexplained label appears on the cross-client Operations screen as a workspace's entire sending state

**Screen:** `/operations/outbound` (Admin operations) → "Sender readiness by
workspace" table.

**Exact words on screen:** two of four workspaces read *"Legacy transport:
mock"* in the **State** column, next to others reading *"Mailbox outreach
ready."*

**What a new operator would reasonably conclude:** unclear whether a
workspace marked "Legacy transport: mock" can send real outreach today at
all, or whether that is a normal, currently-fine state for some workspaces
(e.g. ones with no client mailboxes yet).

**What is actually true:** same underlying fact as finding 6 — "mock" here
means the workspace has no connected client mailbox and would fall back to
the legacy system transport, which does not deliver real prospect outreach.
That is a materially different situation from "Mailbox outreach ready" shown
one row above it, but the table gives both states equal visual weight and
neither is explained on this screen.

**What it should say instead:** state the operationally relevant fact
plainly for this table's purpose (queue troubleshooting) — e.g. "No mailbox
connected — cannot send real outreach" — rather than the internal transport
name.

## Screens walked, for the record

32 screens, all passing the harness's mechanical checks: root, dashboard,
client-list, client-new, client-overview, client-brief, client-onboarding,
client-mailboxes, client-sources, client-contacts, client-templates,
client-outreach, client-activity, client-suppression,
replies-needing-a-person, activity, activity-outbound-detail, contacts,
universe, suppression, reporting, reporting-detail, operations-outbound,
support, training, training-module, training-staff-handover, settings,
settings-branding, settings-staff-access, settings-deleted-workspaces,
settings-ai-spend.

**One artefact-reading correction made during this pass, recorded so the
next reader does not repeat it:** `reporting-detail` was navigated directly
by the harness with no `metric` query parameter, which is not how a real
operator reaches it — every real link into that page (`detailHref(...)` in
`src/app/(app)/reporting/page.tsx`) always carries a `metric` value. The
"That metric doesn't have a row-level breakdown" text the harness captured is
therefore an artefact of the harness's own navigation, not a real dead end a
customer-facing click would hit, and it is **not** listed as a finding above.

## Gates run for this row

No application code, schema, or copy changed, so there is nothing new for
lint/typecheck/the unit suite to catch — they were run anyway, as this row's
Definition of Done requires, to confirm this cycle's own actions (re-running
the e2e spec, reading source, writing this file) left the tree exactly as
clean as it started:

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — full unit suite green.
- `npx playwright test e2e/screen-walk.spec.ts` — 32/32 passed (the
  regenerated artefacts this findings list is built from).
