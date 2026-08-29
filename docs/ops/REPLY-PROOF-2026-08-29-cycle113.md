# The reply leg of row 92 — cycle 113, no new check performed and why

**Short answer: this cycle did not re-run the walk, the database read, or the
reply-sync trigger, because no time in which new information could exist had
passed. Dimension 1 stays at 8, unchanged from cycle 112.**

## The time math, checked rather than assumed

Cycle 112's own log records it finishing at approximately **00:21 UK time**
on 2026-08-30 (started 00:06:33, ran ~14.4 minutes). This cycle's brief was
dispatched immediately after — checked directly against the live system at
the start of this cycle:

```
GET /api/build-info -> buildTimestamp 2026-08-29T23:14:05Z  (= 2026-08-30 00:14 UK)
date -u                -> 2026-08-29 23:22:33 UTC            (= 2026-08-30 00:22:33 UK)
```

Roughly **one minute** separates cycle 112 finishing and cycle 113 starting.
The reply-sync cron only runs weekdays 07:00–18:00 UK time
(`.github/workflows/sync-replies.yml`, `cron: "*/15 7-18 * * 1-5"`) — it is a
Sunday, ~00:22 UK, nowhere near that window. No cron ran. No new brief text,
no new instruction from Greg, and no indication of any human action (a fresh
send, a fresh reply, a matcher fix) appears anywhere in this row's text since
cycle 112 wrote it. There is no plausible mechanism by which the database
state cycle 112 already read and the screens cycle 112 already inspected
could have changed in that one minute.

## Why re-running the check anyway would be dishonest, not thorough

Cycle 112 already made this exact argument once (citing cycle 110's
precedent for an identical-brief redispatch) and flagged, as a finding not
acted on, that continuing to redispatch this row every cycle before Monday
produces "this same near-zero-information result at the cost of a full cycle
each time." This is now the **fourth consecutive cycle** carrying the same
brief text (110, 111, 112, 113), and the gap between 112 finishing and 113
starting is the tightest yet — about one minute, not "the same Saturday
night" but the same minute. Re-triggering the reply-sync endpoint again, or
re-minting a session to re-load the same screens, would not be a fresh
observation; it would be re-reading data nothing has touched, dressed up as
new evidence. That is exactly the failure mode row 92 itself exists to guard
against — "a cycle log claiming it happened" — inverted: manufacturing a
re-check that cannot possibly show anything different is its own kind of
false signal.

## What is still true, unchanged from `REPLY-PROOF-2026-08-29-cycle112.md`

- The reply pipeline works: a real external reply was ingested and matched
  by a real rule to a real outbound, on the real production database
  (`REPLY-PROOF-2026-08-29.md`, cycle 111).
- The specific send this walk needs proven (`cmteyyrsj0003g1mgs2slvdj3`,
  "Cycle 109 send-and-reply walk (v2)") was, as of cycle 112's read, still
  `SENT`, not `REPLIED`, with the one real reply filed against the 26 August
  send instead, because of the Gmail `+cycle109` alias / exact-`From`-match
  root cause `REPLY-PROOF-2026-08-29.md` documents.
- That state is not expected to change until either Monday's cron window
  (2026-08-31, 07:00 UK) processes something new, or a human takes a fresh
  action (a fresh non-aliased send, a fresh reply, or a matcher change).

## Re-score dimension 1

**Held at 8.** Unchanged. No new evidence exists to move it, and none was
manufactured to look like there was.

## Recommendation for the relay, strengthened from cycle 112's

Cycle 112 recorded this as a finding for "whoever next touches the watcher."
It is now sharper: this row was redispatched again **one minute** after the
previous cycle closed it out, which is consistent with row 95's own finding
that the running watcher has not been restarted since a fix was merged for
exactly this class of problem (PARTIAL rows should only be re-picked after a
restart). Concretely, this row should not be redispatched again until one of:
(a) Monday 2026-08-31, 07:00 UK, when the reply-sync cron window opens and
could plausibly change the state; (b) a human (Greg) takes a new action on
the send/reply chain; or (c) row 95 is actioned (the watcher is restarted by
Greg, by hand, per its own instruction) and the PARTIAL-pickup behaviour it
describes takes effect. This is written down as a finding, not acted on —
fixing the watcher's redispatch cadence is row 95's job, not this row's, and
this row's own text does not authorize touching `relay-watch.ps1`.
