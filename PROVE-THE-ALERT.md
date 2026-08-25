# Prove the alert arrives — happy path first, then break it

The three settings are in GitHub: `RESEND_API_KEY` and `ALERT_TO_EMAIL` as
secrets, `ALERT_FROM_EMAIL` as a variable.

`feat/job-alerting` is pushed and NOT merged. Do not merge it until the email
has actually arrived. An alerting system that has never delivered a message is
worse than none, because it buys false confidence.

---

## Order matters. Do not skip to breaking things.

If you break a job first and no email arrives, you cannot tell whether the
alerting is broken or the break simply did not register. Two unknowns at once
diagnose nothing.

### Step 1 — Send a real email while everything is healthy

Trigger the digest manually via `workflow_dispatch`, with dry-run OFF, in the
current healthy state.

This exercises the whole chain — key, from address, to address, Resend, the
inbox — and risks nothing. Expect the OK subject:
`ODoutreach OK — 4/4 jobs, N sent` or whatever the real counts are.

**Then confirm with Greg that it arrived, and ask which folder.** If it landed
in spam or Promotions, that is a finding and the alerting is not finished:
an alarm nobody sees is not an alarm. Record the answer either way.

Do not proceed to Step 2 until Greg confirms an email in his hand.

### Step 2 — Break it on purpose. FAILED path.

The safest break touches no client data and no mailbox, and reverts in seconds:
**temporarily change the shared secret the workflow uses to call the internal
job route**, so the route answers 401 and the run fails honestly.

Prefer that over any change to application code. If a different mechanism is
genuinely cleaner in this repo, use it and say why — but it must not touch a
real client mailbox, real prospect data, or the live send path.

Expect: `ODoutreach FAILED — <job> did not run`.

**Restore the secret immediately afterwards** and confirm the next run is green.
Say in your reply that you restored it and how you verified.

### Step 3 — The PARTIAL path, which is the one that actually matters

FAILED was never the bug. The bug was a run that looked fine while part of it
was failing — the green tick over 8 of 35 broken mailboxes. That is the path
worth proving.

Force exactly one item in a batch to fail, so the route returns 207 with
`ok: false` and the workflow reads the body rather than the status.

Guard it so it cannot be left on by accident: a temporary environment variable,
removed in the same session, and named so nobody mistakes it for a feature.
It must be impossible for this to be sitting enabled next week.

Expect: `ODoutreach PARTIAL — <job> failed for 1 of N`.

---

## One decision for Greg, and it needs asking not assuming

The digest cron is `0 7 * * 1-5` — weekdays only.

Sending is a weekday activity, so that fits. But reply sync runs every day, and
a Saturday failure would go unreported until Monday morning. Put it to Greg
plainly: **is a weekend outage acceptable to learn about on Monday?** Do not
change the schedule on your own judgement either way.

## Record it

In `STATE.md`: what was broken, the exact time the email arrived, the subject
line it carried, and which folder it landed in. Not "the alert path executed" —
arrived.

If any of the three steps does not produce an email, STOP and report. That is
the most valuable finding available here and it must not be worked around.

## Then, and only then

Merge and deploy. Verify the running commit against `origin/main` by hash
through the direct App Service URL.

After that, Part 2 of the previous brief — reply claiming — is still outstanding
and unstarted. It is the next piece of work, in its own PR.
