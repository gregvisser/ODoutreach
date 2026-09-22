# Support agent go-live checklist

**This document does not process live tickets.** Merging the plumbing does
not set `SUPPORT_AGENT_SCHEDULE_ENABLED`, and does not touch outreach, DNC,
open/click tracking, mailbox OAuth secrets, or Machine/AI sending.

Authoritative runner: `.github/workflows/support-agent.yml` (xAI Grok via
`scripts/support-agent/grok-support-runner.mjs`). Mission:
`docs/support-agent-goal.md`. Tooling: `docs/SUPPORT_AGENT.md`.

Measured 2026-09-22 against `gregvisser/ODoutreach`:

| Fact | Evidence |
|---|---|
| Workflow file is the live Support path | `gh api repos/gregvisser/ODoutreach/actions/workflows/support-agent.yml` reports `state` `active` (2026-09-22). An earlier measurement on 2026-09-18 was `disabled_manually`. This change does not toggle the workflow. |
| Runner is xAI Grok, not OpenAI and not Claude | The job runs `node scripts/support-agent/grok-support-runner.mjs` against `https://api.x.ai/v1/chat/completions`. Default model `grok-4.7`. No Codex action, no OpenAI key, no Anthropic key. |
| Codex hang history | Manual `process-tickets` run `35598328022` (2026-09-21): step `Run support agent with Codex` started `2026-09-21T12:14:37Z` and was still in progress when the job was cancelled at `2026-09-21T12:43:41Z` (~29 minutes). The output adapter had sent that command's stdout and stderr to `/dev/null`, so the log showed no tool, exit, or timeout. Earlier cancel of the same step: run `35140939085`. Neither run opened a `support/*` pull request. Codex authentication-check run `35140782510` (2026-09-16) had succeeded. |
| Schedule stays off unless the variable is exactly true | Job `resolve-tickets` runs on `schedule` only when repository variable `SUPPORT_AGENT_SCHEDULE_ENABLED` is exactly `true`. Otherwise job `scheduled-hold` succeeds and does not call the model or read tickets. This change does not create or set that variable. |

## Hard rails (do not)

Do **not** do any of the following during validation or activation:

- Trigger outreach, campaign launch, sequence send, or `process-outbound-queue`
- Weaken DNC / unsubscribe / suppression (including sheet-shrink overrides)
- Turn open/click tracking on, or change tracking-off defaults
- Rotate mailbox OAuth secrets (`MAILBOX_OAUTH_SECRET`) or `AUTH_SECRET`
- Pass Graph/sender credentials into `support-agent.yml` (reporter mail is the separate `Process support ticket notifications` workflow)
- Unlock `MACHINE_ACTIVATION` / `AI_OUTREACH_FEATURES` / autonomous send for non-BidlowAI clients
- Push directly to `main`, skip required checks, or run production Prisma migrate
- Print ticket bodies, screenshots, or credentials in public Actions logs
- Resolve live tickets by hand as part of this checklist
- Set `SUPPORT_AGENT_SCHEDULE_ENABLED` as part of the model rewire

## Secrets and variables (from current files)

Required for **any** Grok step:

| Name | Kind | Used for |
|---|---|---|
| `XAI_API_KEY` | GitHub Actions repository secret | xAI chat completions. Same **name** as the Azure App Setting used by product AI. Actions does not read Azure; set the GitHub secret to the xAI key. Do not print the value. `OPENAI_API_KEY` is not read. |

Required only for `schedule` and manual `process-tickets`:

| Name | Kind | Used for |
|---|---|---|
| `SUPPORT_AGENT_DATABASE_URL` | repository secret | Production Postgres (`SupportTicket`). Same value as `PRODUCTION_DATABASE_URL`. |
| `SUPPORT_AGENT_GH_TOKEN` | repository secret | Fine-grained PAT (`contents: write` + `pull-requests: write`) so later repair pushes can trigger deploy. |

Optional:

| Name | Kind | Default / effect |
|---|---|---|
| `SUPPORT_AGENT_MODEL` | repository variable | `grok-4.7` if unset. Allowed ids and aliases are below. Any other value (including a previous OpenAI id) is refused before HTTP with `status=MODEL_REJECTED`. |
| `SUPPORT_AGENT_SCHEDULE_ENABLED` | repository variable | Anything other than exactly `true`, including unset, keeps scheduled ticket processing on the hold job. Set to exactly `true` only after a controlled `process-tickets` observation. |

Model ids sent to `api.x.ai` (support runner; product default remains `grok-4.6`):

| `SUPPORT_AGENT_MODEL` | Sent as |
|---|---|
| unset, empty, or `grok-4.7` | `grok-4.7` |
| `grok-4-7` | `grok-4.7` |
| `grok-4.6` | `grok-4.6` |
| `grok-4-6`, `grok-4-0709` | `grok-4.6` (same aliases as `src/lib/ai/model-catalog.ts`) |
| `grok-4-fast-non-reasoning` | `grok-4-fast-non-reasoning` |
| `grok-4.20-0309-non-reasoning` | `grok-4.20-0309-non-reasoning` |

The runner does **not** receive Graph send secrets or reporter-notify sender
settings. Those belong to `.github/workflows/process-support-ticket-notifications.yml`.
Child commands also do not receive `XAI_API_KEY`.

Public logs are structured tokens: `event`, `mode`, `model`, HTTP status,
`finish_reason`, tool `name`, `exit`, `elapsed_ms`, `timed_out`, `open_count`.
Ticket bodies, command output, and secrets are not written to the log. A
stalled HTTP call is aborted at 120 seconds. The runner aborts itself at 18
minutes (`event=timeout exit=124`). The step `timeout-minutes` is 20, so a hung
model cannot sit for ~30 minutes the way run `35598328022` did. Cancel still
stops the process (`event=signal`).

## Step 1 — Confirm the workflow is enabled

Measured state on 2026-09-22 is already `active`. Re-check before a dispatch;
a disabled workflow cannot be dispatched.

1. Open https://github.com/gregvisser/ODoutreach/actions/workflows/support-agent.yml
2. If the page says the workflow is disabled, click **Enable workflow**.
3. Confirm with `gh api repos/gregvisser/ODoutreach/actions/workflows/support-agent.yml` that `state` is `active`.

Leave `SUPPORT_AGENT_SCHEDULE_ENABLED` unset or not `true`. Enabling the
workflow must not start hourly ticket processing.

## Step 2 — Authentication check

From the repo root, on `main`, after this change is merged:

```bash
gh workflow run support-agent.yml --ref main -f mode=authentication-check
gh run list --workflow=support-agent.yml --limit 3
gh run watch
```

UI equivalent: **Actions → Support agent → Run workflow → Use workflow from
`main` → mode `authentication-check` → Run workflow**.

**Green looks like**

- Job `resolve-tickets` runs (not `scheduled-hold`).
- `Guard — required secrets present` succeeds (`XAI_API_KEY` only for this mode).
- `Run support agent with Grok` succeeds well inside 20 minutes.
- The log contains `event=start mode=authentication-check model=grok-4.7` and `event=result status=AUTHENTICATION_OK exit=0`.
- `status=AUTHENTICATION_OK` means the CI connectivity probe passed. The model phrase is `READY`. The result line includes `reply_chars` and does not print the reply. It is a fixed log token, not a ticket transcript.
- Workflow conclusion `success`.

**On failure**

- Guard missing `XAI_API_KEY`: set the GitHub repository secret of that name. Do not paste the key into the log, the PR, or Azure from this checklist.
- `status=MODEL_REJECTED`: `SUPPORT_AGENT_MODEL` is not an allowed Grok id. Delete the variable or set it to `grok-4.7`.
- `http=401`: the GitHub secret is present but refused by xAI. Replace the secret value. Do not point this workflow at Graph or notify credentials.
- `status=AUTH_MISMATCH`: xAI returned HTTP 200 but the reply was not the probe phrase `READY` (bare, wrapped, or a short sentence ending on that phrase). The log status string stays `AUTH_MISMATCH`. The log includes `reply_chars` and does not print the reply. Do not add a debug print of the model text.
- `event=timeout`: the model call did not finish inside the runner deadline. Cancel is no longer the only signal; the step also stops at 20 minutes.

## Step 3 — One controlled `process-tickets` observation

Only after Step 2 is green. This **can** read OPEN tickets and open repair PRs.
Watch it. Cancel it if it goes sideways. Do **not** set
`SUPPORT_AGENT_SCHEDULE_ENABLED`.

```bash
gh workflow run support-agent.yml --ref main -f mode=process-tickets
gh run list --workflow=support-agent.yml --limit 3
gh run watch
```

UI equivalent: **Run workflow → `main` → mode `process-tickets`**.

**Watch, in parallel**

- The run: Guard must require `SUPPORT_AGENT_DATABASE_URL` and `SUPPORT_AGENT_GH_TOKEN` this time. The Grok step starts and logs `event=xai_request` before each model call and `name=list_open_tickets` (or `event=timeout` / `event=signal`) so a stall is visible.
- https://github.com/gregvisser/ODoutreach/pulls — new `support/<ticketId>-…` branches/PRs only.
- The live app `/support` queue — statuses must not jump to RESOLVED unless a verified repair PR merged.
- Sending, DNC, tracking, mailbox OAuth: no related workflow runs, no secret edits.

**Green for this observation** (any one of)

- Grok step succeeds, logs show tool names and exit codes, no unexpected PRs, tickets untouched because the queue was empty (`open_count=0`) or the run finished `UNVERIFIED`, or
- Grok step succeeds and a **code-only** support PR appears that obeys the hard rails, or
- You cancel the run from the Actions UI. The log should show `event=signal` rather than a half-hour gap. Record that ticket processing remains UNVERIFIED if you cancelled before a repair finished.

Public logs must not show ticket bodies. That is required. They should show step status, tool names, exit codes, and timeouts.

**On failure**

- Guard missing DB/PAT secrets: set them; do not fall back to `DATABASE_URL` on the runner.
- Step hits the 20-minute timeout or logs `event=timeout`: stop. Do not raise the step budget to recreate the Codex hang.
- Any send/DNC/tracking/mailbox change: cancel, revert that change, leave the schedule gate off, escalate.

## Step 4 — Optional: allow weekday cron

Only after a `process-tickets` run has completed (not cancelled) without
crossing the hard rails. Do not do this as part of the Grok rewire.

1. Repo **Settings → Secrets and variables → Actions → Variables**.
2. Create `SUPPORT_AGENT_SCHEDULE_ENABLED` with value `true` (exact string).
3. CLI equivalent: `gh variable set SUPPORT_AGENT_SCHEDULE_ENABLED --body true`
4. Next weekday hour between 08:00 and 18:00 UTC, confirm a `resolve-tickets` job actually starts (not `scheduled-hold`).

To hold cron again without disabling the whole workflow: delete the variable or
set it to anything other than `true`. To stop all runs, disable the workflow in
the Actions UI.

## What this change does not do

- Does not set `SUPPORT_AGENT_SCHEDULE_ENABLED`.
- Does not resolve OPEN tickets.
- Does not send outreach or reporter mail from the support runner.
- Does not change DNC, tracking defaults, mailbox OAuth, Machine activation, or reply-match order.
