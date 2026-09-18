# Support agent go-live checklist

**This document does not process live tickets.** Merging the plumbing does
not enable the GitHub Actions workflow, does not set
`SUPPORT_AGENT_SCHEDULE_ENABLED`, and does not touch outreach, DNC,
open/click tracking, mailbox OAuth secrets, or Machine/AI sending.

Authoritative runner: `.github/workflows/support-agent.yml` (OpenAI Codex,
commit-pinned). Mission: `docs/support-agent-goal.md`. Tooling:
`docs/SUPPORT_AGENT.md`.

Measured 2026-09-18 against `gregvisser/ODoutreach`:

| Fact | Evidence |
|---|---|
| Runner is Codex, not Claude | Workflow checks out `openai/codex-action` at `86365089eb2b84e0a8fb0717b304f8bdcb13b20e` and adapts it with `scripts/support-agent/adapt-codex-action.mjs`. No `claude`, `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` remains in this workflow. |
| Claude scheduled failures (through 2026-09-16) | Latest Claude cron, run `35132345174`: `Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead`. |
| Codex auth-check succeeded | Manual `authentication-check`, run `35140782510` (2026-09-16, head `c1591c2`). |
| No proven ticket-processing run since Codex | Manual `process-tickets`, run `35140939085`, cancelled while `Run support agent with Codex` was in progress. No later scheduled run exists. |
| Workflow is disabled in the Actions UI | `gh api .../actions/workflows` reports `Support agent` as `disabled_manually`. Cron cannot fire and the Actions UI cannot dispatch until it is enabled. |
| Schedule stays off even after UI enable | Job `resolve-tickets` runs on `schedule` only when repository variable `SUPPORT_AGENT_SCHEDULE_ENABLED` is exactly `true`. Unset/false runs job `scheduled-hold` (success, no Codex, no tickets). |

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

## Secrets and variables (from current files)

Required for **any** Codex step:

| Name | Kind | Used for |
|---|---|---|
| `OPENAI_API_KEY` | repository secret | Official Codex action. Pay-as-you-go API key, not a ChatGPT desktop session. |

Required only for `schedule` and manual `process-tickets`:

| Name | Kind | Used for |
|---|---|---|
| `SUPPORT_AGENT_DATABASE_URL` | repository secret | Production Postgres (`SupportTicket`). Same value as `PRODUCTION_DATABASE_URL`. |
| `SUPPORT_AGENT_GH_TOKEN` | repository secret | Fine-grained PAT (`contents: write` + `pull-requests: write`) so later repair pushes can trigger deploy. |

Optional:

| Name | Kind | Default / effect |
|---|---|---|
| `SUPPORT_AGENT_MODEL` | repository variable | `gpt-5.6-sol` at `effort: medium` if unset |
| `SUPPORT_AGENT_SCHEDULE_ENABLED` | repository variable | Unset = scheduled ticket processing held. Set to exactly `true` only after a controlled `process-tickets` observation. |

The runner does **not** receive `MS_GRAPH_*`, `SUPPORT_AGENT_NOTIFY_SENDER`, or
`SUPPORT_AGENT_NOTIFY_BCC`. Those belong to
`.github/workflows/process-support-ticket-notifications.yml`.

## Step 1 — Enable the workflow (Actions UI only)

This is a GitHub click, not a code change. Do not skip it: a disabled workflow
cannot be dispatched.

1. Open https://github.com/gregvisser/ODoutreach/actions/workflows/support-agent.yml
2. If the page says the workflow is disabled, click **Enable workflow**.
3. Confirm with `gh api repos/gregvisser/ODoutreach/actions/workflows` that the `Support agent` workflow `state` is `active`.

Leave `SUPPORT_AGENT_SCHEDULE_ENABLED` unset. Enabling the workflow must not
start hourly ticket processing.

## Step 2 — Authentication check

From the repo root, on `main`:

```bash
gh workflow run support-agent.yml --ref main -f mode=authentication-check
gh run list --workflow=support-agent.yml --limit 3
gh run watch
```

UI equivalent: **Actions → Support agent → Run workflow → Use workflow from
`main` → mode `authentication-check` → Run workflow**.

**Green looks like**

- Job `resolve-tickets` runs (not skipped).
- `Guard — required secrets present` succeeds (`OPENAI_API_KEY` only for this mode).
- `Apply trusted local output adapter` succeeds.
- `Run support agent with Codex` succeeds (proven ~17s on run `35140782510`).
- Workflow conclusion `success`.

You will **not** see `AUTHENTICATION_OK` in public logs. The adapter discards
the final Codex stdout/stderr on purpose so ticket transcripts cannot leak.
Exit code 0 on that step is the proof.

**On failure**

- Guard missing `OPENAI_API_KEY`: set the repository secret; do not paste a ChatGPT cookie.
- Adapter / pin mismatch: the checkout SHA is not `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`, or upstream `action.yml` changed. Stop; do not process tickets.
- Codex step red after a green adapter: auth/model problem. Re-check `OPENAI_API_KEY` and optional `SUPPORT_AGENT_MODEL`. Do not set Graph/notify secrets on this workflow to “fix” it.

## Step 3 — One controlled `process-tickets` observation

Only after Step 2 is green. This **can** read OPEN tickets and open repair PRs.
Watch it. Cancel it if it goes sideways. Do **not** set
`SUPPORT_AGENT_SCHEDULE_ENABLED` yet.

```bash
gh workflow run support-agent.yml --ref main -f mode=process-tickets
gh run list --workflow=support-agent.yml --limit 3
gh run watch
```

UI equivalent: **Run workflow → `main` → mode `process-tickets`**.

**Watch, in parallel**

- The run: Guard must require `SUPPORT_AGENT_DATABASE_URL` and `SUPPORT_AGENT_GH_TOKEN` this time. Codex step starts.
- https://github.com/gregvisser/ODoutreach/pulls — new `support/<ticketId>-…` branches/PRs only.
- The live app `/support` queue — statuses must not jump to RESOLVED unless a verified repair PR merged.
- Sending, DNC, tracking, mailbox OAuth: no related workflow runs, no secret edits.

**Green for this observation** (any one of)

- Codex step succeeds, no unexpected PRs, tickets untouched because the queue was empty, or
- Codex step succeeds and a **code-only** support PR appears that obeys the hard rails, or
- You cancel the run from the Actions UI (same class as cancelled run `35140939085`) because you only needed to prove startup. Record that ticket processing remains UNVERIFIED.

Public logs will not show ticket bodies. That is required, not a defect.

**On failure**

- Guard missing DB/PAT secrets: set them; do not fall back to `DATABASE_URL` on the runner.
- Codex hangs past ~20 minutes with no PR: **Cancel workflow**. That is safer than waiting out the 45-minute timeout.
- Any send/DNC/tracking/mailbox change: cancel, revert that change, leave the schedule gate off, escalate.

## Step 4 — Optional: allow weekday cron

Only after a `process-tickets` run has completed (not cancelled) without
crossing the hard rails.

1. Repo **Settings → Secrets and variables → Actions → Variables**.
2. Create `SUPPORT_AGENT_SCHEDULE_ENABLED` with value `true` (exact string).
3. CLI equivalent: `gh variable set SUPPORT_AGENT_SCHEDULE_ENABLED --body true`
4. Next weekday hour between 08:00 and 18:00 UTC, confirm a `resolve-tickets` job actually starts (not `scheduled-hold`).

To hold cron again without disabling the whole workflow: delete the variable or
set it to anything other than `true`. To stop all runs, disable the workflow in
the Actions UI.

## What this PR / merge does not do

- Does not enable the Actions workflow.
- Does not set `SUPPORT_AGENT_SCHEDULE_ENABLED`.
- Does not resolve OPEN tickets.
- Does not send outreach or reporter mail from the support runner.
- Does not change DNC, tracking defaults, mailbox OAuth, Machine activation, or reply-match order.
