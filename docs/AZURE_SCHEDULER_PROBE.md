# Azure scheduler verification

The GitHub sending workflow requests a five-minute schedule, but observed runs were hours apart. This read-only WebJob tests whether the existing Azure host can provide a dependable timer before any sending trigger is moved.

The job calls only scheduled-outreach protocol 1's `plan` phase. It cannot sync mail, advance follow-ups or drain the queue. It logs timestamps and counts; identifiers and credentials are omitted. A failed or malformed response exits unsuccessfully, without retries. Existing GitHub sending remains unchanged.

The deployment package includes `App_Data/jobs/triggered/odoutreach-scheduler-probe`. Its five-minute NCRONTAB includes seconds. The current host has Always On enabled. Linux WebJobs also require `WEBSITE_SKIP_RUNNING_KUDUAGENT=false`; inspect the existing value before any configuration change. The existing PROCESS_QUEUE_SECRET is used in memory.

Verification requires Azure execution history showing repeated automatic starts at the expected interval and successful plan responses. A local test, deployment success, or one manually triggered run does not prove timer reliability. Verify at least three consecutive automatic runs before planning a cutover. There is no automatic promotion to sending.

Before moving sending, preserve single-run coordination, per-message claims, calendar scoping and all sending safeguards; disable the old scheduled trigger as part of the cutover. Do not run both sending schedulers together. The new probe does not fix the current sending delays by itself.

References: [WebJob execution](https://learn.microsoft.com/en-us/azure/app-service/webjobs-execution), [Linux prerequisites](https://learn.microsoft.com/en-us/azure/app-service/tutorial-webjobs), [GitHub scheduling limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
