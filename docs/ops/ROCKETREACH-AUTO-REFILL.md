# RocketReach list top-up

Automatic list top-up can add people to a sequence's list from a saved research plan. It does not enrol those people and it does not send email. Enrolment and the first email stay human-launched, the same as today.

Greg Visser is the only approver. Do not ask the client to approve this.

## What staff see

- **Sources → Prospect research plans → Run plan into list.** Same confirmation phrase as a manual search (`SEARCH ROCKETREACH`), same filters, same cap of 10 lookups. Every run records who ran it, when, credits used, contacts added, and why people were skipped.
- **Sources → Search prospects on RocketReach.** The card shows the account credit balance (cached for five minutes, from RocketReach's free account endpoint) and the worst-case credit cost of the click. People already known by RocketReach profile id, LinkedIn URL, or email are skipped before a paid lookup. A brand-new list is created only when at least one person is saved. If a search fails or nobody is saved, that new list is not left behind.
- **Outreach → selected sequence → Automatic list top-up.** Status, last run, the size of the next top-up and the mailbox capacity it was sized to, credits reserved today against the daily safety budget, and the on/off control. **Preview top-up** shows Universe matches against the RocketReach shortfall and an estimated credit cost. **Find matches in Universe** is free: it previews, then **Add Universe matches to the list** writes them. Neither action enrols or sends. Preview does not spend credits.

People added by the scheduled job are labelled `Sourced automatically from plan <name> on <date>` on the contact and in Universe. Open the list and expand the person to read "Where this person came from".

## How to switch it on

Credits are spent only when every switch below is on. A missing switch means the job does nothing for that sequence.

1. Apply migration `20260929120000_rocketreach_plan_runs_and_refill` with `prisma migrate deploy`. Production deploys do not migrate unless `PRODUCTION_PRISMA_MIGRATE` is `true`. The Sources and Outreach pages read the new tables, so apply the migration before the new code serves traffic.
2. The client is **Active** and on **Machine sending**.
3. A staff member opens the sequence on the Outreach tab, chooses a saved research plan, sets the threshold, the daily safety budget (at least 30, default 60) and the balance floor, and types `ENABLE LIST TOP-UP`.
4. On the Azure App Service, set `ROCKETREACH_AUTO_REFILL` to `true` (also accepted: `1`, `yes`, `on`). Any other value, including unset, is **off**.
5. `ROCKETREACH_API_KEY` is set. Optional: `ROCKETREACH_MIN_CREDIT_FLOOR` is a whole number. It can only raise a sequence's own balance floor, never lower it.
6. The GitHub Action **RocketReach list top-up** is on the default branch. It calls `POST /api/internal/rocketreach-refill/v1` every 15 minutes on weekdays, 07:00–18:00 UTC, with `PROCESS_QUEUE_SECRET`.

To turn one sequence off, type `DISABLE LIST TOP-UP` on that sequence. To stop every sequence at once, set `ROCKETREACH_AUTO_REFILL` back to empty or `off`. No deploy is required for the env change; restart the app if Azure does not pick up the setting on its own.

## What one run does

The job looks at sequences whose top-up is on. It counts list members who have an email, are not on a do-not-contact flag, and are not enrolled. If that count is already at the threshold, it logs a skip and stops. The threshold is what "the list has run low" means.

### Batch size (decided by Greg Visser, 3 Oct 2026)

When the list has run low, one top-up adds a **batch of 10 to 30 people**. The batch is sized to what the client's connected sending mailboxes can safely send over the next **3 days**:

- capacity = the sum of each connected, active, send-enabled mailbox's warm-up-aware daily cap (`effectiveDailyCap`, the same cap the sender uses) × 3
- batch = capacity − ready contacts already waiting, clamped to 10–30
- no connected sending mailbox, or the waiting contacts already cover the 3 days: no top-up, and the reason is logged

The batch is **per top-up, not a lifetime cap**. When the list runs low again, the next scheduled run tops it up again. There is **no monthly credit cap**: each client pays its own RocketReach bill. The rule's old `maxCreditsPerRun` and `maxCreditsPerMonth` columns are no longer read. Manual searches and manual plan runs stay at 10.

### Universe first

It looks in Universe first, using people this client already sourced whose title, employer or industry, seniority, and location match the saved plan. People already on the list, people enrolled on this sequence, do-not-contact, blocked companies and domains, and the 10-day cooldown are left out. A person sourced only for another client is not copied: the privacy policy does not share personal data between customers for outreach, and Universe is kept for de-duplication. New people added from Universe are labelled `Re-harvested from Universe on <date>`. People this client already holds keep their existing origin and are only attached to the list.

RocketReach is used only for the part of the batch Universe could not fill. The job skips people already in Universe or on this client, and reserves one credit **before** each paid lookup. It stops at the batch (never more than 30), the daily safety budget, or the balance floor. Do-not-contact is checked again when the person is saved, the same way a manual import checks it. Suppressed people can still be saved and flagged. They are not enrolled and they are not emailed.

The daily safety budget uses UTC, the same clock as mailbox daily caps.

## Credit risks

- One RocketReach key is shared by every client. One sequence's top-up spends from that same balance.
- Search is free. A lookup spends a credit when RocketReach returns contact details. A lookup that returns no email is treated as not charged and the reserved slot is released. A lookup whose result is unknown stays reserved so the budget cannot be exceeded by retries.
- The balance check uses the free account endpoint. If that call fails, the job spends nothing.
- Preview does not call lookup. A manual "Run plan into list" and the Sources search card do, after the confirmation phrase.
- There is no monthly cap. Leaving `ROCKETREACH_AUTO_REFILL` on will keep buying up to one batch whenever a list runs low, limited per sequence by the daily safety budget and by the balance floor. Because a batch is sized to about 3 days of safe sending, a list only runs low again as fast as the mailboxes send.

## What this does not change

Send, pacing, do-not-contact decisions, launch approval, and enrolment are unchanged. Open tracking stays off. Product AI stays on xAI only.
