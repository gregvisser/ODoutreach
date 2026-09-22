# Built-in outreach AI — inventory and enablement

**Date:** 2026-09-21  
**This document does not enable production flags.** Merging it does not set
Azure App Settings, does not add `ANTHROPIC_API_KEY`, and does not touch send
governance, DNC, tracking-off defaults, mailbox OAuth, or reply-match order.
AI assistance must not itself send mail (already true in code).

Authoritative switch: `src/lib/ai/ai-switch.ts` (`areAiFeaturesEnabled`).
Every model call goes through `src/server/ai/metered-call.ts` (ledger + refusals).
Product AI HTTP choke point: `src/server/ai/anthropic-messages.ts` (`callAiToolMessages`)
→ xAI (`src/server/ai/xai-chat-completions.ts`) when `AI_MODEL_PROVIDER=xai` or
`XAI_API_KEY` is set; Anthropic (`postAnthropicMessages`) when
`AI_MODEL_PROVIDER=anthropic`. UI `aiConfigured` uses `isProductAiConfigured()` in
`src/server/ai/ai-provider.ts` (not `ANTHROPIC_API_KEY` alone).

**xAI credential env name:** `XAI_API_KEY` only (no alternate aliases in code).

**Support agent** (`.github/workflows/support-agent.yml`) uses the same credential
name as a **GitHub Actions secret**, model default `grok-4.7`, via
`scripts/support-agent/grok-support-runner.mjs`. It does not read the Azure
`XAI_MODEL` app setting and it does not use OpenAI. Do not enable
`SUPPORT_AGENT_SCHEDULE_ENABLED` for product-AI work. See
`docs/ops/SUPPORT-AGENT-GO-LIVE.md`.

`MACHINE_ACTIVATION_AVAILABLE` is already `true` in source
(`src/lib/clients/client-autonomous-send.ts`). That is **Machine sending**,
not drafting AI. Do not treat this enablement as Machine send activation.

---

## Gate behaviour (verified on `main`)

| Variable | Where | What “on” looks like | What “off” looks like | Default in code / `.env.example` |
|----------|--------|----------------------|------------------------|----------------------------------|
| `AI_FEATURES` | Azure App Setting (not a GitHub secret) | **Unset**, empty, or any value that is **not** an off-value | `off` / `false` / `0` / `no` / `disabled` (trimmed, case-insensitive) | Unset/empty → **master ON**. Empty string is not an off-value. |
| `AI_OUTREACH_FEATURES` | Azure App Setting | `on` / `true` / `1` / `yes` / `enabled` (trimmed, case-insensitive) | Unset, empty, `"off"`, typos (`typo` is **off**) | `.env.example` `"off"` → five outreach features **off** |
| `AI_MODEL_PROVIDER` | Azure App Setting | `xai` (production default) | `anthropic` → rollback path only | Unset → xAI when `XAI_API_KEY` set, else anthropic |
| `XAI_API_KEY` | Azure App Setting **secret** | Non-empty xAI key | Unset/empty (with provider xai) → `no_api_key` | Empty in example |
| `XAI_MODEL` | Azure App Setting | **Live** api.x.ai chat model id that has a rate in `model-catalog.ts` (e.g. `grok-4.6`, `grok-4.7`, `grok-4-fast-non-reasoning`) | Wrong/unknown id → `no_rate_for_model` or API 404 | Unset → `grok-4.6` |
| `ANTHROPIC_API_KEY` | Azure App Setting **secret** | Only when `AI_MODEL_PROVIDER=anthropic` | Not required for xAI outreach | May remain in prod but unused when provider=xai |
| `ANTHROPIC_WORKSPACE_ID` | Azure App Setting (not a secret) | Anthropic rollback only — identity-linked key header | Unset → header omitted for workspace-scoped keys | Empty in example |

Master kill: if `AI_FEATURES` is an off-value, **all** AI (outreach, reply classification, training) refuses with `ai_features_switched_off`.

Outreach opt-in: the five features below also require `AI_OUTREACH_FEATURES` on-values. Training and reply classification do **not** use that flag.

---

## 1. Inventory — five outreach features

All five: staff-only; billed per client on `AiUsageEvent`; **do not enqueue, launch, or send**.

### SEQUENCE_DRAFTING

| | |
|--|--|
| UI | `/clients/[clientId]/templates` — “Draft emails with AI” → `AiSequenceDraftPanel` (`src/components/clients/email-templates/ai-sequence-draft-panel.tsx`). Page gate: `areAiFeaturesEnabled("SEQUENCE_DRAFTING")`. |
| Action | `draftClientSequenceWithAiAction` in `src/app/(app)/clients/[clientId]/outreach/ai-sequence-actions.ts` (auth = template mutator). |
| Server | `draftSequenceForClient` in `src/server/ai/draft-sequence.ts`; prompt/tool `src/lib/ai/sequence-drafting.ts`. |
| Writes | Five `ClientEmailTemplate` rows as **`DRAFT`**, no approver. Does **not** create a sequence, enroll anyone, or call `createEmailTemplate` (that path auto-approves). |
| Does not send | Proven by `draft-sequence.test.ts` (“never approves its own copy”). |

### CAMPAIGN_REVIEW

| | |
|--|--|
| UI | `/clients/[clientId]/outreach` → `AiCampaignReviewPanel`. |
| Action | `reviewClientCampaignWithAiAction` in `ai-campaign-review-actions.ts` (sequence mutator). |
| Server | `reviewCampaign` in `src/server/ai/review-campaign.ts`; `src/lib/ai/campaign-review.ts`. |
| Writes | One `AiCampaignReview` row. Does not change sequence, templates, enrollments, or launch readiness. |
| Needs | A non-archived sequence with at least one step, or `no_steps`. |

### SEND_TIME_ADVICE

| | |
|--|--|
| UI | Outreach tab → `AiSendTimePanel` (`#ai-send-times`). |
| Action | `adviseClientSendTimesWithAiAction` in `ai-send-time-actions.ts`. |
| Server | `adviseSendTimes` in `src/server/ai/advise-send-times.ts`; evidence in `src/lib/ai/send-time-evidence.ts` **before** any model call. |
| Writes | One `AiSendTimeAdvice` row. Does not change calendars, delays, queue rows, or cron. |
| Evidence gate (no charge if failed) | Last 180 days: ≥200 sends, ≥20 replies, ≥3 hour-slots with ≥25 sends each. Thin history is an honest refusal, not a broken flag. |

### REP_PERFORMANCE

| | |
|--|--|
| UI | `/clients/[clientId]/mailboxes` → `RepPerformancePanel` (`#ai-sender-comparison`). Compares **mailboxes**, not people. |
| Action | `explainClientRepPerformanceWithAiAction` in `ai-rep-performance-actions.ts`. |
| Server | `explainRepPerformance` in `src/server/ai/explain-rep-performance.ts`; `src/lib/ai/rep-performance-evidence.ts`. |
| Writes | One `AiRepPerformanceReview` row. Does not toggle send, caps, or primary mailbox. |
| Evidence gate | Last 180 days: ≥2 mailboxes with ≥150 sends each, ≥400 total sends, ≥20 replies. |

### TITLE_MESSAGE_FIT

| | |
|--|--|
| UI | Outreach tab → `TitleMessagePanel` (`#ai-message-fit`). |
| Action | `adviseClientTitleMessagesWithAiAction` in `ai-title-message-actions.ts`. |
| Server | `adviseTitleMessages` in `src/server/ai/advise-title-messages.ts`; `src/lib/ai/title-message-evidence.ts`. |
| Writes | One `AiTitleMessageReview` row. Does not change campaigns, lists, or enrollments. |
| Evidence gate | Mature enrollments (35+ days), family/cell minima (e.g. 60 enrollments per cell, 2 messages per family, 25 client replies). |

---

## 2. Non-outreach AI (not gated by `AI_OUTREACH_FEATURES`)

### REPLY_CLASSIFICATION

- Trigger: inbound ingest / mailbox sync (`classifyInboundReplyQuietly` from `src/server/email/inbound/ingest.ts` and `src/server/mailbox/process-synced-replies.ts`).
- Server: `src/server/ai/classify-inbound-reply.ts`.
- UI: badges on `/replies` and client Activity. `/replies` shows a master-off banner via `areAiFeaturesEnabled()` (no feature argument = master switch only).
- **CR-10:** `carriesPersonalData: true` and xAI is **not** in `COVERED_PROCESSORS`. `runMeteredAiCall` refuses `no_processor_allowance` **even with a valid API key**. Enabling outreach flags does **not** start sending prospect reply text to the model vendor. Closing that is a DPA / `COVERED_PROCESSORS` decision, not this enablement.

### TRAINING_ASSISTANT

- UI: app-shell search (`TrainingAssistantSearch` in `AppHeader`, Ctrl/Cmd+K) — not the Training tab.
- Action: `askTrainingAssistantAction` → `answerTrainingQuestion`.
- Billed to client slug `bidlowai` (must exist). Reads only static training chunks. Does not send mail.
- Gated by `AI_FEATURES` + API key only.

### Spend screen

- `/settings/ai-spend` (super-admin). Reads the ledger. Banner for master `AI_FEATURES` off. Rates still unverified (`RATES_VERIFIED = false`) — do not invoice dollar amounts until prices are checked.

---

## 3. Azure enablement (operator, not this PR)

App: `app-opensdoors-outreach-prod`, RG `rg-opensdoors-outreach-prod`.

**Do (names only; never paste key material into tickets/PRs):**

1. Confirm `AI_MODEL_PROVIDER` = `xai`, `XAI_API_KEY` is present (name check only), and `XAI_MODEL` is a **live** xAI model id listed in `XAI_CHAT_MODELS` / `src/lib/ai/model-catalog.ts` (recommended: `grok-4.6`). Typos like `grok-4-6` are remapped in code, but Azure should use the dotted id from [docs.x.ai/models](https://docs.x.ai/docs/models).
2. Confirm `AI_FEATURES` is **not** an off-value (prefer **omit** the setting, or leave blank).
3. Set `AI_OUTREACH_FEATURES` = `on` (or `true` / `1` / `yes` / `enabled`).
4. Saving App Settings restarts the app. Wait for healthy `GET /api/health`.
5. Do **not** set `COVERED_PROCESSORS` in env — it is code, not a setting.
6. Do **not** change DNC, tracking, `MAILBOX_OAUTH_SECRET`, `AUTH_SECRET`, `PROCESS_QUEUE_SECRET`, send cron, or Machine/autonomous-send settings for this work.

**Do not** copy `AI_OUTREACH_FEATURES=on` into GitHub Actions build env as a substitute for Azure: production secrets and flags are runtime App Settings (deploy workflow is compile-only placeholders). Historical proof that Azure runtime keys are honoured: live `api.anthropic.com` calls after the key was added (see `docs/ops/AI-FEATURES-FIRE-VERIFICATION-2026-08-30-cycle157.md`).

---

## 4. Staff verification checklist (BidlowAI preferred)

Use the **bidlowai** workspace. **Do not** launch a sequence, approve an AI draft, drain the outbound queue, reconnect a mailbox, opt into tracking, or edit DNC.

Expect spend: a successful call writes `AiUsageEvent` status `OK`. Refusals write `REFUSED` at cost 0.

| # | Feature | Where | Pass | Must not happen |
|---|---------|--------|------|-----------------|
| 1 | SEQUENCE_DRAFTING | Templates → “Draft emails with AI” (section open when the flag is on) | Button enabled (not “switched off” / “not configured”). Click once. Flash says drafts written. New templates are **Draft**. | No new sequence, no enrollments, no `OutboundEmail`, templates not Approved. |
| 2 | CAMPAIGN_REVIEW | Outreach → campaign review | Pick a sequence that has steps. Score/findings appear. Sequence step copy unchanged. | Launch button / enrollment counts unchanged. |
| 3 | SEND_TIME_ADVICE | Outreach → send times | Either advice + “Nothing has been rescheduled”, **or** a plain-English evidence refusal (not enough sends/replies). Calendar hours unchanged. | No queue rows, no cron change. |
| 4 | REP_PERFORMANCE | Mailboxes → sender comparison | Table/explanation **or** evidence refusal. Mailbox send toggles unchanged. | No cap/primary/send-enable change. |
| 5 | TITLE_MESSAGE_FIT | Outreach → message fit | Analysis **or** evidence refusal. Sequences/lists unchanged. | No enrollment writes. |
| 6 | TRAINING_ASSISTANT | Ctrl/Cmd+K | Ask “How do I connect a mailbox?”. Answer cites training or “I don’t know”. | No mail sent. |
| 7 | REPLY_CLASSIFICATION | `/replies` | Still **Not checked yet** / unclassified for new replies while CR-10 holds. | No prospect body reaching the vendor (`no_processor_allowance` on ledger if a call was attempted). |
| 8 | Ledger | `/settings/ai-spend` (owner) | Outreach features show `OK` (or evidence path never called the model). No unexpected `ERROR` storm. | Dollar column remains an estimate until rates are verified. |

If the UI still says “This optional AI tool is switched off”, the App Setting is not an on-value (or `AI_FEATURES` is off) — fix config; do not patch the switch. If it says the API key is missing, set `XAI_API_KEY` (production) or `ANTHROPIC_API_KEY` when `AI_MODEL_PROVIDER=anthropic`. If ledger shows `no_rate_for_model`, set `XAI_MODEL` to a model id listed in `XAI_CHAT_MODELS` / `model-catalog.ts`.

---

## 5. Code vs config

No send/DNC/tracking/OAuth/matcher change is required for intended outreach AI behaviour once flags and key are on. Sequence drafts stay DRAFT; reviews/advice write AI tables only.

**Still blocked by design after outreach opt-in:** reply classification (CR-10 / processor DPA). That is not an outreach-flag bug.

### Verify “Write sequence with AI” on prod (no send)

After deploy: sign in as staff → **bidlowai** client → **Templates** → open “Draft emails with AI” → run once. Expect success flash and five new **Draft** templates. Check `/settings/ai-spend` for `SEQUENCE_DRAFTING` status `OK` and a non-zero token count. Do not approve drafts, create a sequence, or launch.
