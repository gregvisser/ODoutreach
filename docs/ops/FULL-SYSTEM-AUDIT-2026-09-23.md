# Full system audit — staff can run outreach without Greg supervising

**Date:** 2026-09-23
**Repo:** `gregvisser/ODoutreach`
**Base inspected:** `main` at `e0f20b2` (`fix(support-agent): clarify tool rails and stop no-progress loops`, #700)
**Method:** source audit of the ten areas below. Unit tests, ESLint, and `tsc --noEmit` were run on the fixes in this change. The new dispatch integration test was **not** executed here (no Docker / Postgres in this environment). Live Azure App Settings, GitHub variable values, and a signed-in browser walk were **not** performed. Where a live value is unknown it is marked **UNKNOWN**. This is not a customer-ready grade.

**Not done in this change (standing rules):** Support schedule was not enabled. Open tracking was not turned on. DNC shrinks were not loosened. Machine sending was not switched on for any client. `MAILBOX_OAUTH_SECRET` / `AUTH_SECRET` were not rotated.

---

## GREEN

These behaviours match the standing product rules in the code that was read.

### Open tracking stays off until a client opts in

`Client.openTrackingEnabledAt` is nullable and unset means off. A pixel is built only after that timestamp is set and the client's own link domain is verified (`src/lib/tracking/client-open-tracking.ts`, `src/server/email/outbound/execute-one.ts`). This change does not opt any client in.

### Sends leave from the customer's mailbox

Governed sequence and reply sends go through the connected Google or Microsoft mailbox (`execute-one.ts`). There is no product path that sends cold outreach from a shared OpensDoors ESP identity. The Resend setting on the settings page is a separate provider flag and is not the sequence dispatcher.

### DNC is fail-closed

`decideSuppressionReplace` refuses a sheet sync that would drop any existing blocked address or domain. The only removal path is the explicit `confirmShrink` action, labelled "Remove them anyway" (`src/lib/suppression/replace-guard.ts`, `src/components/clients/client-suppression-inline-card.tsx`). Manual in-app blocks are written with `sourceId: null`, so a later sheet replace cannot delete them (`src/app/(app)/clients/do-not-contact-actions.ts`). No staff screen deletes a manual email or domain block. Company-name discovery proposes only; it does not unblock sends.

### Reply match order is unchanged

Mailbox sync still matches in this order (`src/server/mailbox/process-synced-replies.ts`):

1. RFC 5322 `In-Reply-To` against the Message-ID stored on the outbound (`BY_THREAD_REF`), and only when the sender is not an internal domain.
2. Subject-anchored match to a send from that mailbox to that exact address (`BY_CONTACT_EMAIL`).
3. If neither links, a standalone STOP can still suppress. Sender identity alone does not create a campaign reply.

The legacy webhook ingest order is still provider-id, then contact email, then unlinked (`src/server/email/inbound/ingest.ts`). This change does not reorder either path.

### A linked reply stops later follow-ups — now including ones already queued

`stopFollowUpsForLinkedReply` still flips `PENDING` / `PAUSED` enrolments to `COMPLETED`, which the planner and dispatcher skip. See **FIXED IN THIS PR** for the queued-row hole that this previously left open.

### Human send vs machine send

`Client.autonomousSendEnabled` is three-state. `null` and `false` both refuse an automatic send. Automatic follow-up advance only loads clients where the column is `true` (`src/server/email-sequences/advance-due-followups.ts`). `beginOutboundDispatch` re-checks that column for rows marked `AUTOMATED_SEQUENCE` and holds them with a plain sentence when it is not `true`. A signed-in person can still launch. `MACHINE_ACTIVATION_AVAILABLE` is `true` in source, so the account card can be set to Machine. That does **not** turn Machine on for every client. The column default remains unset.

### Pacing, calendar, and queue recovery

- Send pacing defaults **on**. `MAILBOX_SEND_PACING` of `false` / `off` / `0` / `no` disables it (`src/lib/mailboxes/send-pacing.ts`). A paced row is put back to `QUEUED` with "This email is waiting for the mailbox's next scheduled batch. It stays queued."
- A closed client calendar does the same with "This email is waiting for the client's sending hours. It stays queued." Unset calendars keep the weekday UTC window used by the scheduler.
- GitHub `process-outbound-queue.yml` calls protocol 1 only: plan, per-mailbox sync, per-client advance, then one queue drain limited to the plan's client ids. An empty plan claims nothing (`queue-processor.ts`).
- Azure `odoutreach-queue-recovery` posts `phase: 'queue'` only. The route loads the plan and drains `plan.clientIds`. It does not enrol or advance campaigns. The timer runs only when `OUTBOUND_QUEUE_RECOVERY_TIMER=on`. Whether that is on in production is **UNKNOWN**.

### Campaign selection, when it is set

`parseCampaignSchedulerSelection` returns null for unset or blank input and throws on malformed JSON. The selected-campaign worker (`runSelectedCampaignFollowUps`) skips entirely when nothing is configured. It syncs that client's mailboxes first, refuses a partial reply sync, and drains only the outbound ids it just created or that were already pending for that selection. It does not drain the shared queue.

When the variable **is** set, `advanceDueSequenceFollowUps` and `beginOutboundDispatch` treat it as a ceiling: other clients and other sequences are not advanced, and an automatic row outside the selection is failed as `CAMPAIGN_SELECTION_HELD` rather than sent. Malformed JSON throws and the claim is left unchanged (covered by `send-outcome-recovery.integration.test.ts`).

### Support agent cannot send, and the schedule gate is still default-off

`.github/workflows/support-agent.yml`:

- Weekday cron runs `scheduled-hold` unless repository variable `SUPPORT_AGENT_SCHEDULE_ENABLED` is exactly `true`. The hold job does not call the model and does not read tickets.
- Manual dispatch defaults to `authentication-check`.
- The Grok step `timeout-minutes` is 20. The runner aborts itself at 18 minutes and aborts a stalled HTTP call at 120 seconds (`scripts/support-agent/grok-support-runner.mjs`). That closes the ~30 minute silent Codex hang (run `35598328022`).
- `classifyCommand` refuses outbound queue scripts, prisma migrate, secret-shaped arguments, email addresses, force-push, and push to `main` / `master`. Child processes do not receive `XAI_API_KEY`. The runner does not get Graph send secrets.

This change does not set `SUPPORT_AGENT_SCHEDULE_ENABLED`.

### Product AI call shape is xAI when the provider resolves to xAI

`callAiToolMessages` is the only feature entry. It calls `api.x.ai` when `resolveProductAiProvider()` is `xai`, and Anthropic only otherwise (`src/server/ai/anthropic-messages.ts`). There is no `api.openai.com` product client. The xAI module speaks the OpenAI-compatible chat-completions shape against `api.x.ai` only. Outreach drafting and review do not enqueue or launch mail. Reply text is refused before any network call because `COVERED_PROCESSORS` is empty (`src/server/ai/ai-feature-data-policy.ts`).

### Staff can open the normal client tabs

In-account roles were removed. `mailboxMutatorAllowedFromRoles` returns true for every active staff member on a live client (`src/lib/mailbox-mutator-policy.ts`). `requireClientAccess` allows every non-deleted client. The sidebar does not hide Clients, Replies, Universe, Blocked contacts, Google logins, Training, or Support from ordinary staff. Super-admin-only pages (operations, staff access, deleted workspaces, AI spend) redirect or hide the link instead of throwing a raw permission error into the middle of those tabs.

### Unsubscribe on real prospect mail

With no verified `go.<domain>`, sequence bodies use the mailto rail ("reply STOP") and do not plant an OpensDoors-app-domain link (`resolveUnsubscribeRail`). A signature that links to the app host still blocks dispatch.

---

## BUGS (P0–P3)

### P0

None found in the code paths read. No path turns tracking on by default, deletes a DNC row without `confirmShrink`, or lets the support runner call the outbound worker.

### P1 — queued follow-up could still send after a linked reply

**Status:** fixed in this PR. See below.

**Repro before the fix:**

1. Launch or let the cron queue a follow-up. Pacing or the calendar leaves it `QUEUED` for minutes or hours (`MAILBOX_SEND_PACING` / `CLIENT_CALENDAR_CLOSED`).
2. The prospect replies. Sync links the reply and `stopFollowUpsForLinkedReply` sets the enrolment to `COMPLETED`.
3. The queued `OutboundEmail` stayed `QUEUED`. `execute-one.ts` did not read enrolment status. The next queue drain sent it.
4. The campaign-selection hold only applied when `CAMPAIGN_SCHEDULER_SELECTION` was set, so the normal unset production case did not catch it.

**Severity:** a stranger who already replied could receive another cold follow-up. A send cannot be recalled.

### P2 — implicit Anthropic fallback is still a product path

`resolveProductAiProvider()` (`src/server/ai/ai-provider.ts`):

- `AI_MODEL_PROVIDER=xai` → xAI.
- `AI_MODEL_PROVIDER=anthropic` → Anthropic even if `XAI_API_KEY` is set (explicit rollback).
- Unset provider and a non-empty `XAI_API_KEY` → xAI.
- Unset provider and **no** `XAI_API_KEY` → **Anthropic**, and `ANTHROPIC_API_KEY` is then the key that is used.

A leftover Anthropic key with no xAI key silently becomes the live backend. Tests lock this (`ai-provider.test.ts`, "defaults to anthropic when no xAI key is configured"). Live Azure values for `AI_MODEL_PROVIDER`, `XAI_API_KEY`, and `ANTHROPIC_API_KEY` are **UNKNOWN**. Not changed here: flipping the default without reading production could turn off a backend that is actually serving, or the reverse.

### P2 — Machine is available in the UI, and unset campaign selection does not limit the main cron

`MACHINE_ACTIVATION_AVAILABLE = true`. Any staff member can set a client to Machine. After that, `process-outbound-queue.yml` (every 5 minutes) calls `advanceDueSequenceFollowUps` for every ACTIVE client in the sending window whose switch is `true`, unless `CAMPAIGN_SCHEDULER_SELECTION` is set. The selected-campaign worker is a separate, default-off ceiling. It is not what the GitHub send cron uses.

This is the August 2026 product decision (per-client switch), not an accidental global enable. It is still the way unattended follow-ups start. Which clients are already `true`, and whether the selection variable is set, is **UNKNOWN**. This change does not set the switch on any client.

### P2 — live safety flags are not visible from the repo

These code defaults are not the same thing as production:

| Flag | Code default | Effect if production differs |
|---|---|---|
| `SEND_DISPATCH_RECHECK_ENABLED` | off unless exactly `true` | 10-day cooldown and recent hard-bounce are planner-only; a long-queued row is not rechecked at dispatch |
| `BOUNCE_SUPPRESSION_ENABLED` | off unless truthy | a bounce does not by itself write a suppression row (the planner still blocks a prior `BOUNCED` outbound) |
| `MAILBOX_WARMUP_RAMP` | off unless `on` | daily cap is the configured cap (max 30), not the ramp |
| `AI_OUTREACH_FEATURES` | off unless on-value | the five draft/review panels stay dark |
| `AI_FEATURES` | on unless an off-value | reply classification and training are eligible, then refused by the processor gate or a missing key |
| `SEQUENCE_FOLLOWUP_AUTOSEND` | on unless off-value | due follow-ups advance for Machine clients |
| `OUTBOUND_QUEUE_RECOVERY_TIMER` | webjob no-ops unless `on` | GitHub remains the sender |
| `CAMPAIGN_SCHEDULER_SELECTION` | no extra ceiling | see P2 above |
| `SUPPORT_AGENT_SCHEDULE_ENABLED` | not `true` → hold | scheduled tickets do not run |

A 2026-08-31 note said dispatch recheck, bounce suppression, and warm-up were on in Azure. That was not re-read on 2026-09-23.

### P2 — Google mailboxes die every seven days until someone reconnects

The Google OAuth app is unpublished. Refresh tokens last seven days (`src/lib/mailboxes/google-refresh-token-expiry.ts`). Microsoft is unaffected. The sidebar badge and `/google-reconnects` exist so any staff member can do it. If nobody does, that mailbox stops sending and reply sync for it stops. This is an operational dependency, not a code defect. It is the main reason a week of outreach can silently stall without Greg.

### P3 — launch and setup copy used names that are not on the tab row

**Status:** fixed in this PR for the strings listed under FIXED.

Before the fix, the overview told staff to "Open suppression" and "Open contacts", and a failed launch said "Re-run 'Prepare send records'". The tabs are **Do-not-contact**, **Lists**, and **Review recipients**.

### P3 — a few actions still throw instead of returning a sentence

`createClientEmailSequenceAction`, `updateClientEmailSequenceAction`, `runStatusAction`, and `prepareClientEmailSequenceStepSendsAction` still call `requireClientAccess` outside the try/catch (`sequence-actions.ts`). The launch actions were fixed in row 109. Ordinary staff do not hit `FORBIDDEN_CLIENT` on a live client. A deleted workspace or a database blip still becomes an uncaught error overlay rather than a flash. `/clients/[id]/email-review` also awaits `requireClientAccess` with no page-level catch.

The re-engage branch still contains the sentence "Re-engage (cooldown override) requires an admin or manager." `canUseCooldownReengage` always returns true, so that sentence is not shown. It will be wrong if the helper ever returns false again.

### P3 — stale comments still describe the old LIVE_PROSPECT gate

`one-click-readiness.ts` said real prospect sends still require `LIVE_PROSPECT`. Sequence governance does not. The comment was corrected in this PR. `CONTROLLED_PILOT` still requires that mode. The approval UI still only offers `CONTROLLED_INTERNAL`, and sequence sends to real prospects depend on `Client.status === ACTIVE` plus a usable unsubscribe rail, not on that mode.

### P3 — reply classification will not run even after an xAI key is set

`REPLY_CLASSIFICATION` carries prospect text and `COVERED_PROCESSORS` is empty, so `runMeteredAiCall` refuses `no_processor_allowance` before HTTP. That is the safe CR-10 behaviour. Staff will not see model labels on replies until a recorded processor allowance exists. Do not "fix" that by adding `XAI` to the set without a decision.

### P3 — support job timeout is 45 minutes; the model step is 20

The Grok step cannot sit for half an hour. The job wrapper is longer than the step. Not a hang by itself. Worth knowing when reading Actions.

---

## FIXED IN THIS PR

### 1. Stop a follow-up that is already queued when a linked reply arrives

`stopFollowUpsForLinkedReply` now fails other `QUEUED` or `PROCESSING` rows on that enrolment when `dispatchStartedAt` is null and no provider message id exists, and releases the mailbox reservation. The replied-to send is not rewritten. A replay after the enrolment is already `COMPLETED` still holds a leftover queued follow-up.

`beginOutboundDispatch` refuses the provider call when the linked step-send is still `PLANNED`/`READY`/`BLOCKED`/`FAILED` and the enrolment is `COMPLETED`, `PAUSED`, or `EXCLUDED` (including when `CAMPAIGN_SCHEDULER_SELECTION` is unset). Rows with no sequence link or an already-`SENT` step-send are unchanged. Reconciliation of an already accepted send is unchanged. A row a reply handler already failed returns that sentence instead of the unconfirmed-send warning.

**Not covered:** if `dispatchStartedAt` is already set, the send has started and is not recalled. That race is milliseconds, not the pacing window.

**Tests:** `sequence-enrollment-send-hold.test.ts`, `stop-follow-ups-on-reply.test.ts` (queued sibling is failed, reservation released, replied id is not the update target). Integration case added in `send-outcome-recovery.integration.test.ts` and not run in this environment.

### 2. Launch and setup copy uses the tab names staff can see

- Empty launch: "No recipients are ready for this step. Open Review recipients, then launch again." (`NO_READY_STEP_SENDS_MESSAGE`). The removed "Prepare send records" button is not named.
- Launch readiness and getting-started actions say "Open do-not-contact" and "Open lists". Routes are unchanged (`/suppression`, `/contacts`).
- The "Not live yet" card says "do-not-contact sheet".
- Launch-approval checklist says "Do-not-contact configured".

---

## NEEDS HUMAN

1. **Read production flags before relying on the code defaults.** In Azure App Service `app-opensdoors-outreach-prod`, names only, no values in tickets: `AI_MODEL_PROVIDER`, whether `XAI_API_KEY` and `ANTHROPIC_API_KEY` exist, `AI_FEATURES`, `AI_OUTREACH_FEATURES`, `XAI_MODEL`, `CAMPAIGN_SCHEDULER_SELECTION`, `SEND_DISPATCH_RECHECK_ENABLED`, `BOUNCE_SUPPRESSION_ENABLED`, `MAILBOX_WARMUP_RAMP`, `SEQUENCE_FOLLOWUP_AUTOSEND`, `OUTBOUND_QUEUE_RECOVERY_TIMER`, `AUTONOMOUS_RELAY_ACTIVE`, `AUTONOMOUS_SEND_ALLOWLIST`. In GitHub, `SUPPORT_AGENT_SCHEDULE_ENABLED` must stay not-`true` until a watched `process-tickets` run is accepted (`docs/ops/SUPPORT-AGENT-GO-LIVE.md`).
2. **Decide the Anthropic fallback.** If production must be xAI-only, set `AI_MODEL_PROVIDER=xai` and keep `XAI_API_KEY` set. Leaving the provider unset with only an Anthropic key selects Anthropic. Do not delete the rollback path until that Azure state is confirmed.
3. **Reply classification.** Leave `COVERED_PROCESSORS` empty until there is a written processor decision. Outreach draft/review can be enabled separately with `AI_OUTREACH_FEATURES` and does not send mail.
4. **Machine clients.** Before staff leave a client on Machine, confirm the contract and that `CAMPAIGN_SCHEDULER_SELECTION` is either unset on purpose (every Machine client in window) or set to the one client and sequence list that may advance. Do not flip every client as part of this audit.
5. **Google reconnect rota.** Put `/google-reconnects` on a staff calendar. The badge counts mailboxes inside five days of expiry or already expired. Microsoft reconnects are admin-consent, not this weekly clock.
6. **Apply this PR's migration-free code, then watch one reply.** No schema change. After deploy, a linked reply on a sequence that already has a later step `QUEUED` should move that later step to failed with `REPLY_STOPPED_FOLLOWUP` or `SEQUENCE_ENROLLMENT_STOPPED`, and the provider should not be called. The integration test in `send-outcome-recovery.integration.test.ts` should be run in CI (it needs Postgres).
7. **Do not rotate `MAILBOX_OAUTH_SECRET` or `AUTH_SECRET`** without a re-encrypt plan. Stored refresh tokens become unreadable and every mailbox is stranded (`src/server/mailbox/oauth-crypto.ts`).

---

## Area notes (what was checked)

### 1. Send paths

Human launch: `sendClientEmailSequenceIntroductionAction` / `sendClientEmailSequenceStepAction` → `sendSequenceStepBatch` → reservation → `OutboundEmail` → `processOutboundSendQueue` → `executeOutboundSend` → `beginOutboundDispatch` → Gmail or Graph. Machine: same dispatcher, `initiatedByAutomation`, client switch required at plan and again at dispatch. Corporate grade slices to four per mailbox with a gap; it does not raise caps. Warm-up applies only when the flag is `on`, and not to replies or internal proof.

### 2. Scheduled follow-ups

Introductions are not auto-launched. Follow-ups are, for Machine clients, inside the freshness window (`SEQUENCE_FOLLOWUP_AUTOSEND_MAX_OVERDUE_DAYS`, default in the resolver). Older due follow-ups stay for a person to launch. `SEQUENCE_FOLLOWUP_AUTOSEND=off` pauses the cron only. One bad step is recorded and skipped.

### 3. Reply sync and classification

`sync-replies.yml` is all days, all hours, unless `vars.REPLY_SYNC_RUNNER == 'azure'`. The send cron also syncs planned mailboxes before advance. Classification is attempted after a new reply and refused for personal data. Opt-out detection on mailbox sync can suppress. Follow-up stop is above.

### 4. DNC

Add-to-list writes immediately and is re-read at send time. Sheet sync is delete-then-insert only after the shrink guard allows it. Family discovery cannot block or unblock a send.

### 5. Mailbox reconnect

Wrong-account consent names both addresses. A failed token exchange on an already sending mailbox leaves it sending (`mailbox-oauth` callbacks). Google expiry copy lives in `google-refresh-token-expiry.ts` and the Google logins page. Staff do not need owner rights to reconnect.

### 6. AI draft / review

Five features, all behind `AI_OUTREACH_FEATURES` on-values plus the master switch and a configured key. They write drafts or advice rows only. UI "configured" follows `isProductAiConfigured()`, which follows the resolved provider's key, not `ANTHROPIC_API_KEY` alone.

### 7. Support agent

Schedule gate, 20-minute step, auth probe phrase `READY`, command denylist including outbound and DNC-adjacent secrets. The agent can still open a code PR; a person merges it. The prompt forbids send, launch, and weakening DNC. This audit did not dispatch the workflow.

### 8. Staff nav

Roles do not block templates, sequences, mailboxes, or DNC edits. Owner-only actions (delete workspace, invite staff, outbound operations console, resolve a support ticket) stay on `isSuperAdmin`. The global `/contacts` send action requires super-admin and matches the page redirect.

### 9. Error copy

Pacing and calendar holds already use plain sentences on `lastErrorMessage`. Activity shows that message for failed rows. The launch button's empty-batch error and the overview links were the strings that named missing controls. Unknown launch-disabled reasons still pass through `humanizeSequenceLaunchDisabledReason` unchanged, so a new internal code can still appear until it is mapped.

### 10. Env vs code

Summarised in the P2 table. `.env.example` sets `AI_OUTREACH_FEATURES` off and documents xAI as the production provider with Anthropic as rollback. That matches the code, including the implicit Anthropic default when no xAI key is present.

---

## Verification run here

| Check | Result |
|---|---|
| `vitest` on the hold, stop-follow-up, launch-copy, launch-state, launch-approval, and getting-started unit tests | pass (98 tests) |
| `eslint` on the edited files | pass |
| `tsc --noEmit` | pass |
| `send-outcome-recovery.integration.test.ts` | not run (no Postgres) |
| Live app walk, Azure setting names, GitHub variable values | not run |
