# Eight mailboxes are dead and all eight say "Connected"

The alerting worked and immediately found real damage. This brief is about the
damage, not the alerting.

Do these in order. Question 1 first, before anything is touched.

---

## 1. FIRST — can these mailboxes still SEND? Answer before doing anything else.

Reply sync fails on all eight with `invalid_grant` or `AADSTS500341`. Both are
refresh-token failures, and sending uses the same grant.

**Five of the eight are Train Hugger — the largest client, 763 sends.**

So the question that decides everything else: **would a send from those
mailboxes fail right now?** Nobody has sent since 3 July, so there is no recent
send evidence either way. Do not guess and do not test by sending to a real
prospect.

Determine it from the token state and the code path, read-only. If sending is
also broken, then the ramp Greg is waiting on is not running for his biggest
client, and that outranks everything else in this file.

Report the answer plainly before continuing.

## 2. The screen says Connected. It is not.

All eight are `connectionStatus: "CONNECTED"` while their credentials are dead.
The batch query selects on CONNECTED, so anything it processed was marked
connected by definition.

**This is the most dangerous thing in this brief.** Staff look at the screen,
see Connected, and believe it. Every other problem here stays invisible behind
that word.

Flip a mailbox out of CONNECTED when its credentials fail, with the reason and
the time, and show it in plain English:

* `Needs reconnecting — Google sign-in expired 6 days ago`
* `Cannot be reconnected — this account no longer exists at Chevron Security`

Red first. The test that matters: a mailbox whose refresh fails must not still
read CONNECTED on the next load.

## 3. Two different problems. Only one of them is fixable by reconnecting.

**Six Google mailboxes** — `invalid_grant`:
`cam@`, `joe@`, `sam.p@`, `taylor@`, `alex@` at trainhugger.com, and
`adam@greentheuk.com`.

Reconnecting fixes them **for seven days**. The Google OAuth app is in
**Testing** mode, and Google expires refresh tokens for unpublished apps on a
7-day cycle. So this will recur every week, forever, until the app is published.

Reconnecting these is treating the symptom. **Publishing the OAuth app is the
fix**, and it is a Google verification process with its own lead time — find out
what it actually requires for this app's scopes and report the steps and the
likely wait. Do not start a verification submission; Greg decides that.

**Two Chevron Security mailboxes** — `AADSTS500341`, the user account has been
**deleted** from Chevron's Microsoft directory:
`jo@chevronsecurity.co.uk`, `charlie@chevronsecurity.co.uk`.

Reconnecting cannot fix a deleted account. No amount of retrying will. These
fail every run forever until somebody at Chevron recreates the accounts or
OpensDoors removes the mailboxes. That is a client conversation, not a repair.

Make the system stop retrying a permanently dead account every run — a
permanent failure and a temporary one should not look the same, and should not
generate the same daily noise.

## 4. Do NOT reconnect anything in this session

Reconnecting touches live client credentials and requires the client's own
sign-in. It is Greg's call and needs the client present. Prepare the ground —
the status flip, the plain-English reasons, the stop-retrying-the-dead — so that
when he does reconnect, the screen tells the truth afterwards.

---

## What this is the third instance of

The signature link audit found during the alert proof had **never run once**,
because `vars.PRODUCTION_APP_URL` was unset. The guard shipped, was wired, and
silently never fired.

That is now three: the cross-domain audit that was never a gate, the opt-out
helper with no production caller, and a workflow that never ran. Same shape
every time — **built, wired, never verified to have actually fired.**

Add it to `standards/defect-classes.json` in the standards repo if it is not
already there, as its own class with these three instances named. Something that
has happened three times is a pattern the gates should be catching, not a run of
bad luck.

## Rules

Red first. Separate PRs. Nothing that touches a live client credential.
Record in STATE.md, including anything here that turns out to be wrong.
