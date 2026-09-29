# Pacing lifecycle — 29 September 2026

## Current contract (supersedes the relaunch notes below)

Capacity is computed **per mailbox**. Each connected mailbox has its own daily cap, warm-up ramp, spacing, and per-tick batch. Several mailboxes can send the same sequence at the same time, each up to its own cap. One mailbox filling up does not reduce another mailbox, and nothing borrows spare capacity from a second mailbox to exceed the first mailbox's cap.

When more than one sequence still has recipients on the **same** mailbox, that mailbox's open slots are split between them. A sequence that is already ahead yields, so launch order cannot starve the other one. The split never raises a cap.

A row held only because of pacing, the sending calendar, mailbox capacity, a shared-mailbox split, or the corporate at-a-time release stays `READY`. The five-minute scheduled tick sends it when that mailbox's allowance opens. Staff do not launch again and do not watch the clock. The Outreach status is "Queued — sends automatically as mailbox capacity frees up" (or the calendar / next-day / shared-capacity equivalent).

Hard stops stay held: do-not-contact and suppression, unsubscribe, bounce, reply-stop, an explicit pause, and a mailbox that is disconnected or unhealthy. The migration `20260929183000_auto_release_pacing_holds` only rewrites the sentence on `READY` pacing holds. It does not change status and it does not clear a suppression hold. The tick uses the same rule, so rows already stored with the old "launch again" sentence are picked up even before that migration runs.

Enrolment is unchanged. Planning recipients does not send them. The first launch is still a staff action. Open tracking stays off. Do-not-contact stays fail-closed. Nothing in this path asks a client to approve a send.

The trace under "What staff were seeing" describes the system **before** this contract. Do not follow its "launch again" instructions.

Read-only code trace for Human-mode introductions that stayed on "Held back by send pacing", and for the red "Process open client calendars" step. No production database was queried. Workflow evidence is from the GitHub Actions API.

## What staff are seeing

Morson FM and Octavian Security are Human sending (`Client.autonomousSendEnabled` is not true). Introduction rows stay `READY` with a pacing, calendar, or capacity sentence. A day's first launch sends about one open batch across the mailbox pool (about 12 for Morson, about 8 for Octavian, which is three or two mailboxes times the default batch of 4). Other rows stay held. Sequences pinned to the Jack mailbox (Morson) and the Cam mailbox (Octavian) have not sent.

## Lifecycle

1. Staff launch on the Outreach tab calls `sendSequenceStepBatch` (`src/server/email-sequences/send-introduction.ts`). That is the only path that turns a Human introduction from `READY` into an `OutboundEmail`.
2. The dispatcher re-checks governance, do-not-contact, cooldown, warm-up, the daily cap, the sending calendar, and send pacing. Pacing (`src/lib/mailboxes/send-pacing.ts`, on unless `MAILBOX_SEND_PACING` is an off value) releases the day's allowance in batches inside 07:00–18:00 UTC, or inside the client's own calendar (`src/lib/mailboxes/calendar-send-pacing.ts`). A row that does not fit the open batch stays `READY`. Only `blockedReason` is written. It is not queued.
3. GitHub Actions workflow `process-outbound-queue.yml` runs every five minutes. The step "Process open client calendars" runs `scripts/run-scheduled-outreach.mjs`, which calls `POST /api/internal/scheduled-outreach/v1`:
   - `plan` — clients whose calendar is open (unset clients use weekdays 07:00–18:59 UTC).
   - `sync` — reply sync for those clients' mailboxes.
   - `advance` — `advanceDueSequenceFollowUps` for each planned client.
   - `queue` — drain up to 25 `OutboundEmail` rows that are already queued, limited to the planned clients.
4. `advance` only loads clients with `autonomousSendEnabled: true` (Machine), status `ACTIVE`, and not deleted. It only walks follow-up steps, never introductions. BidlowAI is the Machine client. Morson and Octavian are skipped here in a few hundred milliseconds.
5. Azure WebJobs in `App_Data/jobs/triggered/` do not add another Human introduction path. `odoutreach-queue-recovery` only runs the `queue` phase, and only when `OUTBOUND_QUEUE_RECOVERY_TIMER=on`. `odoutreach-campaign-scheduler` calls the campaign scheduler, which also requires Machine consent, and only when `CAMPAIGN_SCHEDULER_TIMER=on`. `odoutreach-scheduler-probe` does not send. Whether those timers are on in App Service is not visible from the repo. None of them re-launch a Human introduction.

## Answers

### (1) Do held Human rows go out on their own?

No. A held introduction stays `READY` until staff launch that sequence again. The five-minute workflow does not call the dispatcher for Human introductions. It only drains mail that a launch already placed on the outbound queue. Rows with a pacing sentence were never placed on that queue.

That is the staff contract already written on the launch dialog: remaining recipients "stay pending for a later staff launch; they are not automatically queued." Pacing was built so a repeating Machine follow-up run would not empty a mailbox in the first cron of the morning. Human introductions are still one launch at a time. The old sentence "waiting for the next allowed batch" did not say that the next batch needs another launch. The Outreach tab now says when the next batch can go and that staff have to launch again.

### (2) Why would Jack's or Cam's sequences never send?

All of these can hold a row. Only the last one explains a mailbox that never gets a turn.

- **Mailbox selection.** A sequence with a sending mailbox (`launchPreferredMailboxId`) tries that mailbox first. If that mailbox is disconnected, the launch stops with "not connected" and does not write a pacing sentence. Rows that say "Held back by send pacing" got past that check.
- **Pool auto-pick.** A sequence with no mailbox, and a pinned sequence whose own mailbox has no open slot, used to walk the rest of the pool, highest remaining first, then primary, then id. One launch could book the current batch on every mailbox in the pool.
- **Warm-up.** Only when `MAILBOX_WARMUP_RAMP=on`. A mailbox that has never sent starts at 5 a day, not 0. Warm-up cannot by itself make a mailbox unable to send.
- **Per-mailbox daily cap.** The hard ceiling is the mailbox cap, at most 30. Pacing only withholds part of that until later in the window.
- **Calendar.** A closed calendar holds every mailbox for that client, not one named mailbox.
- **Ordering starvation.** This matches the report. The first sequence launched while a batch is open booked that batch on every mailbox, including Jack and Cam. A Jack sequence launched later in the same sitting found Jack already at zero and was held. The next morning the older sequence was launched first again and took the new batch. Jack and Cam never received a slot. Nothing came back later in the day to give them one, because of answer (1).

### (3) Design or bug?

Held Human rows waiting for another launch is the design. Do not send them from the cron: staff have not asked the product to send the rest unattended, and the launch dialog says they are not queued automatically.

Starvation is a bug. A mailbox pinned to a sequence, or a later sequence on a shared mailbox, could be kept at zero forever by launch order. The dispatcher now shares the open batch:

- A mailbox selected on a sequence is not used by other sequences while that sequence still has READY recipients.
- Two sequences on the same mailbox split the open batch. A sequence that is already ahead of one that is still waiting does not take another slot on that launch.
- Auto-pick sequences share mailboxes that nobody has pinned, instead of the first sequence taking every open slot.

Every existing gate still runs at dispatch: do-not-contact, cooldown, governance, warm-up, daily cap, calendar, pacing, and the corporate four-at-a-time release. Fair share only refuses a slot pacing had already allowed. It never raises a cap. Staff still launch again for anything this launch does not send. After this change, launching the Jack or Cam sequence in the same sitting as the older sequences leaves those mailboxes a share, including when the older sequence is launched first.

## What staff do

- Do not launch a sequence again because of pacing, the sending calendar, or mailbox capacity. Those rows send on the next scheduled tick once that mailbox's own allowance opens.
- One mailbox reaching its cap does not stop the client's other mailboxes from sending the same sequence.
- A do-not-contact, suppression, unsubscribe, bounce, reply-stop, pause, or disconnected mailbox stays held. Reconnect the mailbox, or leave the safety stop in place. Do not ask the client to approve anything.
- Machine follow-ups that are past the automatic window are a separate case. See below. The first follow-up launch on a Human sending client is still a staff action. After that launch, a pacing hold continues on its own.

## Process outbound queue — false failure

Jobs `109333241267` (run `36546248046`, 29 Sep 2026 08:59 UTC), `109076727740` (run `36466183526`, 28 Sep 18:34 UTC), and `108900809075` (run `36414052629`, 28 Sep 11:10 UTC) are the `process-queue` job of "Process outbound queue". Each concluded failure.

On 29 Sep the log shows one `advance` batch with `"ok": false` and a summary of `failed: 1`. Sync, the other advance batches, and the queue drain were ok. The log line was only `Scheduled batch {"phase":"advance","ok":false,"skipped":false}`. The error sentence was not printed. That matches the runner, which recorded `ok` and dropped the response body.

The advance handler's failure flag is `errors[]` from `advanceDueSequenceFollowUps`. The dispatcher throws `NO_READY_ROWS` ("No recipients are ready for this step") when a follow-up step has no READY rows left — already fully sent, or nothing staged. That was pushed onto `errors`, so one finished BidlowAI step failed the whole step even when other sends in the run succeeded. The GitHub log cannot show that sentence until this change is deployed. The code path is the one that produces it.

An already-complete or empty step is now a skip: it is logged, stored on `skippedSteps`, and does not set `ok` false. Any other error is still a failure, and both the HTTP body and the Actions log include the sanitized error text (no connection strings, bearer tokens, or email addresses).

## BidlowAI follow-ups past the 3-day window

`advanceDueSequenceFollowUps` passes `autoSendMaxOverdueMs` from `SEQUENCE_FOLLOWUP_AUTOSEND_MAX_OVERDUE_DAYS`, default 3 (`src/lib/email-sequences/auto-followup-window.ts`). A follow-up that became due more than that long ago stays READY. The cron does not send it. A manual "Send now" has no upper bound.

That is intentional. It is the backlog-blast guard: turning automation back on must not fire every overdue follow-up at once. The three rows (Stamford "First six" follow-up 1, twice, and Crewyard follow-up 1, once) will not be sent by the scheduler. Staff see them as due, with the sentence that they are past the automatic window and need Send now. This behaviour was not changed.
