# AI campaigns

An AI campaign is one confirmation on a client's Outreach page (`START AI CAMPAIGN`).
After that, the five-minute scheduled outreach tick owns the run: find people,
write the emails, check them, prepare, send, follow up, and top the list up.
Staff handle replies. The client is never asked to approve a send.

Human sequences are unchanged. This does **not** set `Client.autonomousSendEnabled`
(Machine sending). A Human client keeps manual first launches. Only the sequence
that belongs to a running AI campaign is sent automatically, and only while
`AI_CAMPAIGNS_ENABLED` is on.

## Kill switch

`AI_CAMPAIGNS_ENABLED`

| Value | Effect |
| --- | --- |
| Unset, empty, or anything other than `1` / `true` / `yes` / `on` | Off. Creating a campaign is refused. The tick does no new work. Pacing resume will not continue an AI campaign's held rows. |
| `true` (also `1`, `yes`, `on`) | On. Staff can start a campaign. The tick advances it. |

The code default is **off**. A deploy cannot start sending until Azure is set
explicitly. Set `AI_CAMPAIGNS_ENABLED=true` in production only after the gates
below pass. Turning it off stops new work on the next pass. Staff can still
stop a campaign while the switch is off.

## Production settings

Apply the additive migration **before** traffic that uses the new pages:

```bash
npx prisma migrate deploy
```

Production deploys do **not** run migrations unless the repo variable
`PRODUCTION_PRISMA_MIGRATE` is `true`. Migration:
`prisma/migrations/20260930140000_ai_outreach_campaigns`.

Then, in Azure App Service config for `app-opensdoors-outreach-prod`:

| Setting | Required for an AI campaign to send |
| --- | --- |
| `AI_CAMPAIGNS_ENABLED` | `true`, and only after this checklist |
| `AI_FEATURES` | Not an off-value (`off` / `false` / `0` / `no` / `disabled`). Unset means the master switch is on. |
| `AI_OUTREACH_FEATURES` | `on` (also `true` / `1` / `yes` / `enabled`) so writing and the writing check can run |
| `AI_MODEL_PROVIDER` | `xai` |
| `XAI_API_KEY` | Live key. Product AI is xAI Grok only. |
| `XAI_MODEL` | A live catalog id (`grok-4.6`, `grok-4.7`, or `grok-4-fast-non-reasoning`) |
| `ROCKETREACH_API_KEY` | Present if the client's own people are not enough |
| `ROCKETREACH_MIN_CREDIT_FLOOR` | Optional. Raises the floor. Unknown or invalid balance spends nothing. |

Not required:

- `ROCKETREACH_AUTO_REFILL` — that switch is for per-sequence list top-up. An AI campaign has its own credit budget.
- Machine sending on the client.

Open tracking stays off. Do not add a tracking flag for this feature.

## What the tick does

The existing scheduled workflow (`process-outbound-queue.yml` →
`/api/internal/scheduled-outreach/v1`, phase `advance`) calls
`tickAiCampaignsForClient` after pacing resume and follow-up advancement.
One side effect per campaign per pass. A lock stops two passes overlapping.
The tick runs only for clients already in the scheduled plan, so the sending
calendar still applies.

1. This client's Universe contacts first (same client only).
2. RocketReach for the shortfall, inside the campaign total and daily budget, and inside the account floor. Known people are skipped before a lookup is paid.
3. Write intro and follow-ups with xAI, using the client brief and the campaign brief. Placeholders still have to be valid or approval fails.
4. Score with the existing campaign review. Below 75, rewrite, up to 3 checks. Still below 75: pause for staff and do not send.
5. Record template approval as system kind `AI` (no fake staff approver), then prepare and send through `sendSequenceStepBatch`.
6. Keep sending follow-ups and topping up until the target, the budget, the end date, or the matches run out.

A paused AI campaign, and every AI campaign while the kill switch is off, is left out of automatic follow-ups. That includes a client that also has Machine sending on. Sequences that are not part of an AI campaign are unchanged. Mail already sitting in the send queue can still go out; the switch stops new work from being queued.

Company size is stored and given to the writer. It is **not** sent to RocketReach.
Unsupported search facets empty the result (same lesson as seniority in #717).

A reply stops that person's sequence, including an unclassified reply. There is
no out-of-office label, so the conservative stop stays.

## Staff alerts

A campaign that needs a person is left in **Waiting for a member of staff**.
The reason is on the campaign timeline, in the audit log, and on the scheduled
job the first time it lands there. Later passes do not fail the cron again for
the same wait. There is no "send anyway" button.

## Gates before `AI_CAMPAIGNS_ENABLED=true` in production

1. Migration applied on the production database.
2. `AI_OUTREACH_FEATURES`, `XAI_API_KEY`, and `XAI_MODEL` already working for draft and review.
3. `ROCKETREACH_API_KEY` present and `ROCKETREACH_MIN_CREDIT_FLOOR` set if a floor is wanted.
4. CI `verify` and `E2E (Playwright)` green on the merge.
5. A staff member with an outreach role (not a viewer) starts one campaign on a test client and confirms the timeline moves without a second confirmation.
6. Confirm a Human client's sequences still need a person for the first send.
