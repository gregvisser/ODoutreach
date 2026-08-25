# Two things Greg approved: tell him when it breaks, and stop double-handling

Both go in ODoutreach. Commit, push, PR and deploy each separately. If either
turns out wrong in the code, stop and say so rather than building it.

---

## PART 1 — Alerting. The decision is made; here it is.

Greg's instruction: *"you make the decision here, and if anyone is to be
notified it will only be me."*

### Who
**Greg only.** No distribution list, no OpensDoors staff. One recipient.

Worth stating once and then dropping: a single recipient means nothing is
noticed while he is away. That is his call to make and he has made it. Do not
build a fallback he did not ask for.

### Channel: email, not SMS
Nothing in this system needs waking a person at 3am. A failed send batch, a
failed reply sync, a failed audit — every one of them can wait until morning
without getting worse. SMS for a system sending 275 emails a day is
over-engineering, and the fastest way to kill alerting is to make it noisy
enough to ignore.

Use **Resend**, which is already integrated. Do not add a vendor.

### What actually triggers an email

Three conditions, and deliberately not "any error":

1. **A scheduled run fails outright.** Send, reply sync, signature audit,
   support agent.
2. **A run reports success but part of it failed.** This is the important one
   and it is the recorded burn — a job went green while 8 of 35 mailboxes were
   failing reply sync, the errors sitting inside an HTTP 200 body. If any item
   in a batch failed, the run is not a success.
3. **A run is missed twice in a row.** One miss is a blip; two is a broken
   schedule.

Everything else — a single bounced email, one mailbox needing reconnection —
goes into a **once-daily digest at 08:00**, not an immediate alert.

### The dead man's switch
An alert route that runs inside the thing that breaks is not a route. If the
app is down, the app cannot email.

So: the daily 08:00 digest sends **every day, including when everything is
fine** — one line, "all four jobs ran, 240 emails sent, nothing to do." Silence
then becomes the signal. If Greg gets nothing by 09:00, something is wrong with
the system OR with the alerting, and he cannot tell the difference between those
two — which is exactly the point.

### The subject line carries the message
Greg reads these on a phone. The subject alone must say whether to act.

* `ODoutreach OK — 4/4 jobs, 240 sent` — nothing to do
* `ODoutreach PARTIAL — reply sync failed for 8 of 35 mailboxes` — act today
* `ODoutreach FAILED — sending did not run` — act now

### Test it by breaking it, and record the result
Greg asked for this explicitly and it is the step everyone skips.

Deliberately fail one scheduled job. Confirm the email actually arrives in
Greg's inbox — not that the code path executed, not that Resend returned 200.
**Arrived.** Record in `STATE.md` what you broke, when the email landed, and
what the subject line said.

If it does not arrive, that is the finding, and it is a bigger one than
anything else in this brief.

---

## PART 2 — Claiming a reply, so two people do not answer the same prospect

Greg's words: *"When someone opens a reply, it's marked as theirs, and the
second person sees 'Sarah is handling this, opened 2 minutes ago.'"*

### It is advisory, NOT a lock
Build a soft claim. It informs; it does not block.

A hard lock creates a worse problem than it solves: someone opens a reply,
goes to lunch, and nobody else can deal with a prospect who is waiting. Never
prevent a second person from acting. Tell them, and let them decide.

### Behaviour
* Opening a reply detail writes a claim: who, and when.
* Anyone else opening it sees, before they act:
  **"Sarah Okafor opened this 2 minutes ago."**
* The claim goes stale after **30 minutes** and stops being shown. Somebody who
  wandered off should not haunt the record all day.
* Acting on the reply — sending, suppressing, marking handled — clears the claim
  and records who actually did it. That second record is permanent; the claim
  is not.
* Do not show a claim to the person who made it. Nobody needs telling they
  opened the thing they are looking at.

### Where
`src/app/(app)/clients/[clientId]/activity/` and the reply detail page. Scope
every read and write by `clientId` as well as row id, like every other mutation
in this codebase, and assert that in the test rather than assuming it.

### The test that matters
Two staff, same reply, second one sees the first one's claim. And: a claim
older than 30 minutes is not shown. Red first on both.

---

## Rules

Red first. Separate PRs. Deploy and verify the running commit against
`origin/main` by hash, through the direct App Service URL — not the CDN-cached
custom domain, and not by trusting a green workflow.

Record in `STATE.md` as you go, including anything that contradicts this brief.
