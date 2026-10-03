# Azure scheduler verification

The GitHub sending workflow requests a five-minute schedule, but observed runs were hours apart. This read-only WebJob tests whether the existing Azure host can provide a dependable timer before any sending trigger is moved.

The job calls only scheduled-outreach protocol 1's `plan` phase. It cannot sync mail, advance follow-ups or drain the queue. It logs timestamps and counts; identifiers and credentials are omitted. A failed or malformed response exits unsuccessfully, without retries. Existing GitHub sending remains unchanged.

The deployment package includes `App_Data/jobs/triggered/odoutreach-scheduler-probe`. Its five-minute NCRONTAB includes seconds. The current host has Always On enabled. Linux WebJobs also require `WEBSITE_SKIP_RUNNING_KUDUAGENT=false`; inspect the existing value before any configuration change. The existing PROCESS_QUEUE_SECRET is used in memory.

Verification requires Azure execution history showing repeated automatic starts at the expected interval and successful plan responses. A local test, deployment success, or one manually triggered run does not prove timer reliability. Verify at least three consecutive automatic runs before planning a cutover. There is no automatic promotion to sending.

The probe stays read-only. Sending moved to the triggered WebJob `odoutreach-scheduled-outreach` (`App_Data/jobs/triggered/odoutreach-scheduled-outreach`). It runs the same plan, sync, advance and queue phases as GitHub, every five minutes, only when the App Service setting `SCHEDULED_OUTREACH_TIMER` is `on`. It uses the existing `PROCESS_QUEUE_SECRET` and does not log it.

`OUTBOUND_QUEUE_RECOVERY_TIMER` must stay unset or any value other than `on`. That older job also drains the queue, and the full clock refuses to start while both are on. `CAMPAIGN_SCHEDULER_TIMER` is a separate follow-up path; leave it off so there is one sender.

GitHub `process-outbound-queue.yml` was retired as a sender on 2026-10-03 (Greg approval; the WebJob had been running every five minutes cleanly). The repository variable could not be written from the ops token, so the default was changed at the source: the scheduled tick still fires, but its send step is skipped unless the repository variable `SCHEDULED_OUTREACH_RUNNER` is exactly `github` (emergency fallback). A manual dispatch still sends. The queue claim is `FOR UPDATE SKIP LOCKED` from `QUEUED` to `PROCESSING`, and the dispatcher locks the READY step-send row before booking a mailbox, so two triggers do not send the same email.

The probe does not fix sending delays by itself.

References: [WebJob execution](https://learn.microsoft.com/en-us/azure/app-service/webjobs-execution), [Linux prerequisites](https://learn.microsoft.com/en-us/azure/app-service/tutorial-webjobs), [GitHub scheduling limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Sending heartbeat and alerts (3 Oct 2026)

The Azure WebJob `odoutreach-scheduled-outreach` is the only production sender.
Each run records a heartbeat in the `SchedulerHeartbeat` table (row
`odoutreach-scheduled-outreach`):

- `lastRunAt`: stamped by the `plan` phase, the first call of every 5-minute
  run, day and night.
- `lastQueueAt`, `lastQueueOkAt`, `lastQueueError`, `consecutiveQueueFailures`,
  `lastQueueClaimed`, `lastQueueCompleted`: stamped by the `queue` (send) phase.

The ops alert (`scripts/ops-alert.ts`, workflow `alerts.yml`) judges sending
from this row, not from GitHub run history:

- FAILED when there is no heartbeat, the last run is more than 20 minutes old,
  or the send phase failed 3 runs in a row.
- PARTIAL after 1–2 failed send runs.
- The 07:00 UTC digest always reports it, with the last-24h sent count.
- An hourly watch (`--sending-watch`, cron `17 * * * *`) emails only on a
  FAILED, and for a stopped job only during the first 3 hours of the outage.

Check it by hand: `SELECT * FROM "SchedulerHeartbeat";`
