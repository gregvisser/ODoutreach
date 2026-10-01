# Azure scheduler verification

The GitHub sending workflow requests a five-minute schedule, but observed runs were hours apart. This read-only WebJob tests whether the existing Azure host can provide a dependable timer before any sending trigger is moved.

The job calls only scheduled-outreach protocol 1's `plan` phase. It cannot sync mail, advance follow-ups or drain the queue. It logs timestamps and counts; identifiers and credentials are omitted. A failed or malformed response exits unsuccessfully, without retries. Existing GitHub sending remains unchanged.

The deployment package includes `App_Data/jobs/triggered/odoutreach-scheduler-probe`. Its five-minute NCRONTAB includes seconds. The current host has Always On enabled. Linux WebJobs also require `WEBSITE_SKIP_RUNNING_KUDUAGENT=false`; inspect the existing value before any configuration change. The existing PROCESS_QUEUE_SECRET is used in memory.

Verification requires Azure execution history showing repeated automatic starts at the expected interval and successful plan responses. A local test, deployment success, or one manually triggered run does not prove timer reliability. Verify at least three consecutive automatic runs before planning a cutover. There is no automatic promotion to sending.

The probe stays read-only. Sending moved to the triggered WebJob `odoutreach-scheduled-outreach` (`App_Data/jobs/triggered/odoutreach-scheduled-outreach`). It runs the same plan, sync, advance and queue phases as GitHub, every five minutes, only when the App Service setting `SCHEDULED_OUTREACH_TIMER` is `on`. It uses the existing `PROCESS_QUEUE_SECRET` and does not log it.

`OUTBOUND_QUEUE_RECOVERY_TIMER` must stay unset or any value other than `on`. That older job also drains the queue, and the full clock refuses to start while both are on. `CAMPAIGN_SCHEDULER_TIMER` is a separate follow-up path; leave it off so there is one sender.

GitHub `process-outbound-queue.yml` stays as the backup, including `workflow_dispatch`. After three automatic in-window WebJob runs, set the GitHub repository variable `SCHEDULED_OUTREACH_RUNNER` to `azure` so the GitHub schedule stops. A manual dispatch still sends. The queue claim is `FOR UPDATE SKIP LOCKED` from `QUEUED` to `PROCESSING`, and the dispatcher locks the READY step-send row before booking a mailbox, so two triggers do not send the same email.

The probe does not fix sending delays by itself.

References: [WebJob execution](https://learn.microsoft.com/en-us/azure/app-service/webjobs-execution), [Linux prerequisites](https://learn.microsoft.com/en-us/azure/app-service/tutorial-webjobs), [GitHub scheduling limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
