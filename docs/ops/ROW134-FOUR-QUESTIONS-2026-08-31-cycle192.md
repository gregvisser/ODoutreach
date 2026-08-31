# Row 134 — four questions Greg asked on 31 August

**Date:** 2026-08-31 · **Cycle:** 192 · **Type:** investigation only — nothing in
`src/`, `prisma/`, or any gate was changed by this row. Every claim below is
cited to a file:line read directly from the codebase, or to a test actually
run. No `.bidlow/GRADES.json`, dimension, or sell gate touched.

Investigated with four parallel read-only research passes (one per question),
cross-checked and, for Q3, independently re-verified by hand against the live
sidebar/routing code.

---

## Q1 — Can a user create a new list for a new sequence from the Universe tab?

**Answer: partially. List creation — yes, directly, and well-surfaced.
Sequence creation — no, it is a separate flow with no link from Universe to
it.**

Universe and sequences are decoupled in both UI and data model:
`ClientEmailSequence.contactListId` is a required foreign key onto
`ContactList` (`prisma/schema.prisma:1358,1366,1379` — "A sequence pairs one
client-scoped `ContactList` with an ordered set of steps"), but a
`ContactList` can exist with zero sequences, and there is no sequence-creation
control anywhere on the Universe page.

**Exact click path for the part that does exist:**
1. `/universe` (sidebar → Universe)
2. Select one or more contacts via the row checkboxes
   (`src/components/universe/universe-page-client.tsx:352-359`)
3. In the "Create list from selected contacts" panel, pick the client
   workspace, type a list name, click **Create list**
   (`universe-page-client.tsx:253-326`, button at 320-324)
4. Submits `createListFromUniverseAction`
   (`src/app/(app)/universe/actions.ts:27-74`) →
   `createClientContactListFromUniverseContacts`
   (`src/server/contacts/universe-to-client-list.ts:26-118`) →
   `findOrCreateClientContactListByName`
   (`src/server/contacts/contact-lists.ts:126`). A success message reports
   the outcome inline; the operator stays on `/universe` — no redirect.

**To then build a sequence with that list** (a second, unconnected flow):
Clients → pick client → Outreach tab (`/clients/[clientId]/outreach`) →
expand "New sequence" (`client-email-sequences-panel.tsx:238`) → pick the
list from the `contactListId` dropdown
(`client-email-sequence-form.tsx:349`).

**Discoverability judgment:** the list-creation step itself is well-labelled
and inline — a non-technical operator would find it easily. But the
post-create success message carries no next-step link, even though the
action already has both `clientId` and the new `listId` in hand
(`universe-page-client.tsx:280-282`). An operator who expects "create a list"
on Universe to be the whole route to "launch a sequence" has no signal that a
second, unrelated screen (Clients → Outreach) is where the sequence actually
gets built.

**Recommendation:** add a "Go build a sequence with this list →" link to the
post-create success message, pointing at
`/clients/{clientId}/outreach`. Small, additive, no schema change — raised as
row 146 below.

---

## Q2 — Are send cooldowns actually in place?

**Answer: yes, real and tested at the point that matters most today — but
there is a genuine, acknowledged gap at dispatch time.**

- **The rule:** `OUTREACH_COOLDOWN_DAYS = 10`
  (`src/lib/email-sequences/recent-send-cooldown.ts:16`), `isEmailInCooldown()`
  (lines 29-37) — matches by lowercased email address, workspace-wide (not
  per-client).
- **Enforced at planning/scheduling time, unconditionally, in production:**
  `src/server/email-sequences/step-sends.ts:340-417` queries `OutboundEmail`
  for any send to that address in the last 10 days across every client, and
  `src/lib/email-sequences/sequence-send-policy.ts:264-271`
  (`classifySequenceStepSendCandidate`, branch "1.5b") marks the candidate
  `SKIPPED` / `skipped_client_outreach_cooldown` instead of `READY` — it never
  reaches the sendable queue.
- **Proven by a real test, run and green:**
  `src/server/email-sequences/step-sends.integration.test.ts:364-399` seeds an
  actual `OutboundEmail` sent 1 day ago against real Postgres, runs the real
  planner, and asserts the resulting `ClientEmailSequenceStepSend.status` is
  not `READY`. Also unit-tested at the pure-logic layer
  (`recent-send-cooldown.test.ts`, `sequence-send-policy.test.ts:246-261`).
  All ran green this cycle.
- **Configurable?** Only at the code level — `OUTREACH_COOLDOWN_DAYS` is a
  single hardcoded TypeScript constant, not per-client, not an env var, not a
  DB field, not editable from any admin UI. The value shown to staff on the
  sequence-preparation panel (`sequence-send-preparation-panel.tsx:16,114,300`)
  reads the same constant — so what staff see matches what's enforced, but
  changing it means shipping code.
- **The gap:** a dispatch-time re-check exists and is fully wired
  (`src/server/email/outbound/dispatch-recheck.ts`, called from
  `execute-one.ts:277-302`), with its own 11 passing unit tests
  (`dispatch-recheck.test.ts`) — but it only runs if
  `SEND_DISPATCH_RECHECK_ENABLED` is set, and that key is **absent from
  `.env`**, i.e. off by default in production (also documented as `off` in
  `docs/ROADMAP-2026-08.md:94`). Suppression/DNC/unsubscribe/bounce ARE
  unconditionally re-checked at dispatch (`execute-one.ts:248-267`); the
  cooldown timer is not. So a row that sits `QUEUED` for a long retry backoff,
  or is manually held and sent later, is never re-verified against the
  cooldown window before it actually leaves.

**Client-facing statement of fact:** yes, the system can be, and is,
prevented from emailing the same prospect inside the 10-day window under
normal operation — that promise is real and proven. The one honest caveat is
that the promise currently relies entirely on the planner catching it before
a row is queued, with no dispatch-time backstop live, for the (currently
rare) case of a long-queued row.

**Recommendation:** flip `SEND_DISPATCH_RECHECK_ENABLED` on — the code and
tests already exist and pass; this is a config change, not new work. Raised
as row 147 below (config-only, Greg's call per the flag's own recommendation
in prior audit notes, not a migration or a send — should not need to stop and
ask, but flagged for visibility since it changes live send behaviour).

---

## Q3 — Are the training modules current and understandable?

**Answer: no — the content is written to a high standard structurally (seven
consistent sections per module, real portal deep-links, worked examples), but
a genuinely thorough pass found twelve confirmed drift defects against the
live code, several of them significant.** Read every module in
`src/lib/training/modules.ts` (9 modules), `STAFF_VIDEO_SCRIPTS`,
`STAFF_HANDOVER_CHECKLIST`, and the standalone
`src/lib/training/staff-handover-guide.ts`, and cross-checked every concrete
UI/route/permission claim against the current code (two independent passes —
one by hand, one by a dedicated research agent — agreed on the two highest
findings below and the second pass surfaced ten more).

**Finding 1 (highest severity — a regression of an already-fixed bug).** The
worked-example template body still ends `"Best,", "{{email_signature}}"`
(`modules.ts:149-150`, reused in the rendered code block at `:903-907`),
directly contradicting the same module's own instruction two paragraphs
later not to add `{{email_signature}}` to a template body (`:814`, `:875`)
and the real placeholder catalogue, which marks it legacy
(`src/lib/email-templates/placeholders.ts:47`). This is the exact class of
regression project memory already recorded once as "Lucy's twice-raised
signature ticket" — see [[mailbox-signature-model]].

**Finding 2.** Mailbox connect/reconnect and signature-editing are described
as admin-only in three places (`modules.ts:413,447,469,1062`,
`staff-handover-guide.ts:23,38`), but
`src/lib/mailboxes/mailbox-setup-access.ts:9-14`
(`canAccessMailboxSetupTools` unconditionally returns `true`) and the
client mailboxes page (`page.tsx:61`, staff-only, no admin check) show this
was opened to all staff — and the training's **own video script**
(`modules.ts:1353`) already says so correctly, disagreeing with the module
text in the same file.

**Finding 3.** The Activity module tells every operator to use a sidebar
link and cross-client view removed and made admin-only in PR #140
(`modules.ts:952,1001-1003`; contradicts `activity/page.tsx:32-49`,
`nav-config.ts:41-46`) — again disagreeing with the video script for the
same page (`modules.ts:1479`).

**Finding 4.** The sidebar screenshot caption (`modules.ts:1048`,
alt text `:1046`) still documents PR #138 state and is missing three live
sidebar items — **"Replies to answer"** (`/replies`) and **"Google logins"**
(`/google-reconnects`), both real, current, self-service daily-use surfaces
per their own code comments (`nav-config.ts:52-58,67-70`), and "Support" —
while still listing "Activity", which is gone. None of the three missing
items is documented anywhere in training.

**Finding 5.** `outreachModule` conflates template authoring with the
Outreach tab (`modules.ts:810-811,836-839`), but template creation moved to
a dedicated Templates tab (`templates/page.tsx:70-81`; the real Outreach
page's own copy says "edit templates on the Templates tab",
`outreach/page.tsx:166-182`).

**Finding 6.** "Internal verification" is taught as an Outreach-tab step
(`modules.ts:861-864`), but `InternalProofSendCard` now renders on the
Mailboxes tab (`mailboxes/page.tsx:8,315`); the Outreach page explicitly
documents the removal (`outreach/page.tsx:252-257`).

**Finding 7 (materially misleading, not cosmetic).** Sources module claims a
contact is "valid" with just a LinkedIn URL, mobile, or office number, no
email needed (`modules.ts:516,552`), but
`src/lib/contact-import-contract.ts:12-14,54`
(`EMAIL_REQUIRED_FOR_PERSISTENCE = true`) and
`src/lib/contacts/import-preview.ts:19-24` show such rows are marked
`skipped` and never persisted — an operator relying on this training text
would misjudge what actually got imported.

**Finding 8.** A whole real workspace tab, **"Setup help"**, added
2026-08-28 (`client-workspace-subnav.tsx:39-43`,
`setup-help/page.tsx:19-33` — the page staff hand to a customer's IT
department for DNS/deliverability + Microsoft admin-consent), is missing
from every tab-row list in training (`modules.ts:227,1030`,
`staff-handover-guide.ts:87,118`) — added within days of this audit, zero
training coverage.

**Finding 9.** The manual-signature button is named "Edit manual signature"
in training (`modules.ts:447,469`); the real button reads **"Set
signature"** (`client-mailbox-identities-panel.tsx:1196`), and the actual
recommended primary action — the 1-click **"Set branded signatures"**
generator (`:978`) — isn't mentioned at all.

**Finding 10.** Dev-isms rendered straight to operators: a raw enum pair and
a PR number in a live step body (`modules.ts:735`: "No raw enum chips like
EMAIL/SUCCESS — that copy was retired in PR #138"), PR numbers in screenshot
captions and video scripts throughout (`:1048`, `staff-handover-guide.ts:88`,
several `STAFF_VIDEO_SCRIPTS` entries). The project's own
`ux-copy-policy.test.ts` doesn't check for this class of leak.

**Finding 11 (gap, not a wrong claim).** The 10-day list-reuse cooldown and
its staff-usable "re-engage" override
(`src/server/tenant/access.ts:28-36`, `canUseCooldownReengage`) are real,
current, and completely undocumented in training — directly relevant to Q2
above.

**Finding 12.** Settings module's "Only admins can change this" role
language (`modules.ts:1060-1062`) is narrowly still true for the staff
roster itself (`staff.ts:171-178`, `staff-access/actions.ts:59-62`: "Roles no
longer gate features... every active staff member gets the full app"), but
reads as broader authority than the product now enforces, and is the root
language that findings 2 and 9 contradict elsewhere.

**Confirmed accurate, no fix needed:** Settings module's section list, the
Lists ("contacts") module KPI names, "Reports is the default landing page",
the CSV twelve-heading list, the RocketReach confirmation-phrase flow, the
`{{email_signature}}` *warning prose itself* (only the worked example
regressed), and the Do-not-contact sync-status copy (only its explanatory
parenthetical is the problem, not the underlying claim).

**Recommendation:** fix all twelve in one training-content PR — it's all
copy inside `src/lib/training/` and two workspace-nav references, no schema
or send-path change, and it's the page a new operator is told to trust as
ground truth. Raised as row 148 below.

---

## Q4 — Would an AI ask-box in Training work, and what would it cost?

**Answer: technically easy and cheap — but only safe under CR-10 if it is
scoped to training content only, never to free-text that could carry a real
prospect's name or words.**

- **Feasibility:** training content is pure static data with no DB reads
  (`src/lib/training/modules.ts:3-6`: "no database reads/writes, no email
  sends, no imports, no suppression sync, no OAuth"). A RAG-over-training-docs
  Q&A box would follow the exact pattern every existing AI feature already
  uses: declare a new `AiFeature` enum value
  (`prisma/schema.prisma:1845`), add its entry to the
  `Record<AiFeature, ...>`-typed `AI_FEATURE_DATA_POLICY`
  (`src/server/ai/ai-feature-data-policy.ts:8-11` — the type itself forces
  every feature to declare a policy, so this can't be skipped by omission),
  call it through the existing `runMeteredAiCall`
  (`src/server/ai/metered-call.ts:73`), same model as `draft-sequence.ts`
  (Haiku 4.5, `src/lib/ai/model-catalog.ts:44`).
- **CR-10 compliance is the real question, not the engineering.**
  `COVERED_PROCESSORS` is a hardcoded empty set
  (`ai-feature-data-policy.ts:78`) — there is no Anthropic Art.28 processor
  allowance on file. Any feature declared `carriesPersonalData: true` is
  refused unconditionally before any network call
  (`ai-feature-data-policy.ts:86-89`, enforced at `metered-call.ts:149-152`),
  and this is proven still working in production today —
  `REPLY_CLASSIFICATION` returns `no_processor_allowance`
  (`docs/ops/AI-FEATURES-REVERIFY-2026-08-30-cycle160.md:159-192`).
- **Could questions carry client/prospect data? Realistically, yes.** An
  operator troubleshooting "why did this bounce" or "how do I fix this reply
  from Jane at Acme" would naturally paste a name, email, or reply text into
  a free-text box — exactly the class of data
  (`ai-feature-data-policy.ts:19-21`) that `REPLY_CLASSIFICATION` is barred
  from sending. A general-purpose support box declared
  `carriesPersonalData: false` while accepting arbitrary text would be false
  on its face.
- **Cost:** Haiku 4.5 is $1/M input, $5/M output tokens
  (`model-catalog.ts:157-158`). A short Q&A (≈1-2K input incl. retrieved
  training-doc context, ≈300-500 output) costs roughly $0.003-$0.005/call —
  in line with the observed `draft-sequence` ($0.004174) and
  `review-campaign` ($0.004468) real spend
  (`AI-FEATURES-REVERIFY-2026-08-30-cycle160.md:130-132`). At 10-50
  questions/day that's **~$1-8/month**; even at a generous 200/day it's
  **~$20-30/month**. Cost is not the constraint here.

**Recommendation: build it, but only as a training-FAQ box, never a general
support box.** Scope retrieval strictly to the static training content in
`modules.ts`/`staff-handover-guide.ts`, declare `carriesPersonalData: false`
only because that scope is structurally enforced (no client/prospect data
ever reaches the prompt), and design the UI/prompt to discourage or scrub
pasted names/emails. Do not let it answer "why did this specific prospect
bounce" — that needs real data and would be refused outright under CR-10
today, exactly like `REPLY_CLASSIFICATION`. Raised as row 149 below.

---

## Ranked findings and rows raised

| # | Finding | Damage if left | Row raised |
|---|---|---|---|
| Q3-1 | Worked-example template body still contains `{{email_signature}}` — a regression of an already-fixed bug (Lucy's ticket) | High — training actively teaches the mistake it warns against, in the exact worked example an operator copies | **148** |
| Q3-7 | Sources module wrongly claims LinkedIn/phone-only rows are "valid" and imported — they're actually skipped | High — operator misjudges what was actually imported | **148** |
| Q3-2 | Mailbox connect/reconnect/signature described as admin-only; product opened this to all staff | Medium-high — operator may wait on an admin unnecessarily, or an admin over-restricts access based on stale training | **148** |
| Q3-3 | Activity module tells staff to use a sidebar link and cross-client page that no longer exist for them (contradicts the platform's own video script for the same page) | Medium — operator follows written training, hits a dead end or an unexpected redirect | **148** |
| Q3-8 | "Setup help" tab (added 2026-08-28) — a real, current, IT-facing page — has zero training coverage | Medium — brand-new important surface invisible to operators | **148** |
| Q3-5 | Outreach module conflates Templates tab (now separate) with Outreach tab | Medium — operator looks for template creation in the wrong place | **148** |
| Q3-6 | "Internal verification" taught as an Outreach step; actually lives on Mailboxes now | Medium — same class as Q3-5 | **148** |
| Q3-4 | Sidebar screenshot stale by 3 missing + 1 removed item | Low-medium — compounds Q3-3 | **148** |
| Q3-9 | Manual-signature button misnamed; 1-click branded-signature generator undocumented | Low-medium — operator does more manual work than needed | **148** |
| Q3-11 | Real 10-day cooldown / re-engage override completely undocumented | Low-medium — directly relevant to Q2's client-facing promise | **148** |
| Q3-10 | Dev-isms (raw enums, PR numbers) rendered straight to operators | Low — unprofessional, not a functional blocker | **148** |
| Q3-12 | Settings "admin-only" role language broader than what's enforced | Low — root cause of Q3-2/Q3-9 confusion | **148** |
| Q1 | Universe → sequence hand-off has no link from the list-creation success message | Low-medium — operator has to already know the product's two-step model; not a dead end, just undiscoverable | **146** |
| Q2 | Dispatch-time cooldown re-check exists, tested, but disabled by default | Medium — real gap in a client-facing promise for long-queued rows, though the primary planning-time check is real and covers the normal case | **147** |
| Q4 | AI ask-box: safe and cheap if scoped correctly; unsafe as a general support box | N/A — forward-looking feature idea, not a defect | **149** |

New rows appended to `.bidlow/relay/QUEUE.md`:
- **146** — Universe → sequence discoverability: add a "build a sequence with
  this list" link to the post-create success message on Universe.
- **147** — Turn on `SEND_DISPATCH_RECHECK_ENABLED` (code + tests already
  exist and pass; config-only) to close the dispatch-time cooldown gap.
- **148** — Fix the two Q3 findings together: rewrite `activityModule`'s
  purpose/steps/portalLink/whatGoodLooksLike to describe per-client Activity
  only, and refresh the stale sidebar screenshot alt text.
- **149** — Build a training-only AI ask-box, scoped per this artefact's
  recommendation, with CR-10 compliance built in from the start (declared
  `carriesPersonalData: false` only because retrieval is structurally
  confined to static training content).

## Hard rule compliance

No email sent, no data deleted, for any client. This row read code and
screens only; the one write outside this artefact and `QUEUE.md` was to
`.bidlow/STATE.md` (session continuity, per the standing gate), which is not
a `_standards` path and not a graded artefact.
