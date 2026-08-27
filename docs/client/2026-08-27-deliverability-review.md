# Email deliverability review

**For:** Sam and James, OpensDoors
**From:** Greg Visser, BidlowAI
**Date:** 27 August 2026

This is the written review of why outreach emails were being filtered, what we
found when we went looking, what we have fixed, and what is still open. It is
deliberately free of technical jargon. Where a number appears, the last section
says exactly where it came from, so you can challenge any of it.

---

## The short version

1. **Emails were being filtered as suspected phishing, and it was our fault, not
   your customers' domains.** Every outreach email carried links pointing at our
   application's web address while the email itself came from your customer's
   own address. That mismatch is the classic pattern spam filters look for. It
   has been fixed and the fix is live.
2. **The bounce rate was being reported as 0%. That was never true.** The real
   figure is roughly **4-5%**. Bounced addresses *were* being blocked correctly
   the whole time — but the report was reading the wrong field, so it showed a
   clean sheet while it happened. That is now fixed and live; it will start
   showing real numbers once sending resumes.
3. **426 bounce notifications had been collected and never read.** For Gmail
   mailboxes we were only downloading the headline of each message and not the
   contents, and the contents are the part that says why it bounced. Fixed.
4. **Eight mailboxes had dead sign-ins and the screen said they were fine.**
   They could not send either — not just fail to collect replies. Five of the
   eight belong to Train Hugger, the largest account. The screen now tells the
   truth. **They have not yet been reconnected.**
5. **No mailbox in the system had ever actually been warmed up.** The gradual
   volume ramp was measuring how long ago a mailbox was connected instead of how
   much it had sent. Fixed — but the consequence is that everything now starts
   at 5 emails a day and takes about five working weeks of daily sending to
   reach 30.

**No outreach has been sent to anyone on your customers' behalf since 3 July.**
Everything below was established by reading the system's own records and by
testing against a BidlowAI mailbox we own.

---

## What was wrong

### 1. Our links made your customers' emails look like phishing

Every outreach email contained two links that pointed at the OpensDoors
application's web address:

- a hidden tracking image, used to record whether an email was opened;
- the unsubscribe link.

Meanwhile, the email's "From" address was your customer's own domain — for
example `luke.smith@morsonfm.co.uk`.

An email that claims to be from one company but whose only links go to a
completely unrelated website is exactly what a phishing email looks like.
Microsoft Defender, Google and the commercial filters sitting in front of most
corporate inboxes all weight this heavily. It is why messages were landing in
quarantine folders rather than inboxes.

**This was not an authentication problem.** SPF, DKIM and DMARC — the three DNS
records that prove an email genuinely came from the domain it claims — were
passing correctly throughout, and still are. That matters, because it means
there was never anything for your customers' IT departments to change. The
problem was entirely inside our software.

### 2. The bounce figure said 0%, and it could not have been right

The system reported a 0% bounce rate across more than 1,200 sends. A genuine 0%
does not happen on cold outreach.

The cause was that two things had been wired to two different places. When a
bounce arrived, the system correctly recognised it and **stopped sending to that
address** — the protection worked. But it never wrote the bounce down against the
original email record, and that record is the one the report counts. The only
code that did write it down belonged to an older sending method we no longer use.

So: bounced addresses were being blocked all along, and the report was showing a
clean sheet while it happened. Protection was real; the number was not.

**This is now fixed.** Both routes a bounce can arrive by — the older sending
method, and the bounce notice that lands back in your own mailbox — write the
bounce down through one single piece of code, so one bounce produces one record
whichever way we heard about it. A bounce notice arriving in a connected Outlook
or Gmail mailbox now marks the original email as bounced, which is the record the
report counts. Two safeguards came with it: a reply from a real person still wins
over a late bounce notice, so a live conversation is never overwritten; and an
address is still blocked even in that case, because the address is dead either
way.

### 3. 426 bounce notifications were collected and never read

There are 426 bounce-shaped messages sitting in the system — 43 in May, **217 in
June**, 120 in July, 41 in August. They were downloaded, stored, and never once
classified.

The reason was mundane. For Gmail mailboxes, the system asked Google for message
summaries rather than full messages. A bounce notification's useful content — the
address that failed and the reason — is in the body of the message. **Of 147
Gmail bounce notifications, not one had a body stored.** Microsoft mailboxes were
fine by comparison: an average of about 4,000 characters of content per message,
against 57 for Gmail.

Looking into this turned up something more serious that nobody had been looking
for. **Unsubscribe requests were being detected from only a short preview of each
reply — roughly 6% of the text — on Microsoft mailboxes too.** The full message
had been downloaded and was sitting in memory; it was simply not passed to the
part of the system that looks for someone asking to be removed. Honouring an
opt-out is a legal obligation under UK marketing rules, not a nicety, so this is
the finding we would rank highest of the six even though it was not the one we
set out to look for.

### 4. The real bounce rate is around 4-5%

Once we stopped trusting the 0%, we worked the figure out a different way.

The obvious approach — count bounce notifications per customer — gave nonsense:
Thomas Franks showed 36 hard bounces against 18 sends, which is impossible.
The reason is that these are your customers' **real working mailboxes**. They
receive bounces from their own staff's ordinary email all day long, and those are
mixed in with ours. The proof is clean: **August contained 42 bounce
notifications against zero outreach sends.**

So we cut it by time instead, which does not depend on reading any message:

| Account | Sends in June | Bounce-shaped messages in June | Rate |
|---|---|---|---|
| Train Hugger | 756 | 72 | 9.5% |
| GreenTheUK | 332 | 30 | 9.0% |

Those bounce notifications land **only** in the month those mailboxes actually
sent — Train Hugger had one in April, when it sent nothing, and none at all in
July or August. The signal tracks the sending.

Not all of those are genuine dead addresses; some are "out of office" and
delayed-delivery notices. Of the Microsoft bounce notifications that quote one of
our own subject lines and could be read properly, 27 out of 73 were genuine
permanent failures — about 37%. Applying that proportion gives a genuine hard
bounce rate of roughly **3.5% to 6%, most likely 4-5%**, across about 1,100
emails of real campaign volume.

**Please treat 4-5% as an estimate, not a measurement.** It cannot be narrowed
further from the existing data, for the reason in finding 3: the Gmail bounce
notifications were stored without their contents, so they cannot now be read.

For context on whether that is bad: there is **no published bounce-rate threshold
from Google or Microsoft**. The "keep it under 2%" figure that circulates widely
comes from vendor marketing, not from either provider — we checked their own
documentation directly rather than repeating it. What Google does publish is a
**spam complaint** limit: keep it below 0.10%, and never let it reach 0.30%.
So 4-5% is not a rule being broken. It is, however, high enough to be worth
reducing, and the lever for that is list quality rather than anything in the
software.

### 5. Eight mailboxes were dead, and the screen said they were connected

Of the 35 mailboxes the system checks, **eight had dead sign-ins**:

- **six** were Google mailboxes whose sign-in had expired;
- **two** were Microsoft accounts that had been **deleted outright** and can
  never be reconnected — both at Chevron Security.

**Five of the eight belong to Train Hugger**, your largest sending account.

Two things about this matter more than the count. First, these mailboxes could
not **send** either, not merely fail to collect replies — one sign-in serves both
jobs, so if it is dead, it is dead for both. Had sending been switched back on,
every email queued for those five Train Hugger mailboxes would have failed.

Second, the good news: it fails safely. There is no fallback that quietly sends
from a different address instead. The email simply does not go.

The screen, however, was actively misleading. Microsoft reports a deleted account
wrapped inside a generic "sign-in expired" response, and our code checked for the
generic case first — so the app told staff to go and complete a sign-in for two
accounts that no longer exist.

### 6. No mailbox had ever been warmed up

Sending volume is supposed to ramp up gradually on a new mailbox. Providers judge
a mailbox on its sending history, and going from nothing to full volume overnight
is one of the strongest signals that something is automated.

Our ramp was measuring the wrong thing: **how long ago a mailbox was connected,
rather than how much it had sent.** Its own documentation said that any mailbox
older than the ramp window was unaffected. So a mailbox connected months ago that
had never sent a single email would have been given its full 30 a day on its very
first send, with no ramp at all — and because accounts are connected during
onboarding, weeks before launch, that describes almost every mailbox you have.

We then checked what the sending history actually looks like, expecting your own
OpensDoors mailboxes to be the exception. They are not. **The most-used mailbox
in the entire system has sent on 10 separate days.** Nine mailboxes have never
sent at all. `greg@opensdoors.co.uk` has 2 sending days across 119.

1,358 emails across 45 mailboxes, with no mailbox sending on more than 10 days,
means the system has been sending in **bursts** — which is precisely the pattern
warming up exists to avoid.

---

## What has been fixed

All of the following is live on production as of today.

| Fix | How we know it is live |
|---|---|
| **Tracking image switched off.** No hidden image on our domain in any outreach email. | Setting read back off the live server today: `OPEN_TRACKING_PIXEL=off`. |
| **Unsubscribe links can no longer point at our domain.** An outreach email now carries either a link on your customer's own matching domain, or an opt-out by replying to the sender — never a link to an unrelated site. | The code that fetched our own web address has been **removed from the sending path entirely**, so it cannot come back by accident. There is an automated test that fails the build if anyone re-introduces it. |
| **Full message contents are now downloaded** from both Google and Microsoft, so bounce notifications can be read. | Live since 24 August. |
| **Unsubscribe detection reads the whole reply**, not a 6% preview, on both providers. | Same change. |
| **The volume ramp now counts days a mailbox actually sent on.** A mailbox that has never sent starts at 5 a day regardless of how long ago it was connected. | Ramp is switched on live (`MAILBOX_WARMUP_RAMP=on`); the ramp figures are pinned by automated tests. |
| **Sending is paced** — four emails at a time with natural gaps through the working day, rather than a burst. Adjustable per customer. | Default is four, switched on by default. |
| **Dead mailboxes now tell the truth**, and distinguish "sign in again" from "this account no longer exists and cannot be reconnected". | See below — this one was proved by watching it happen. |
| **Bounced addresses are blocked automatically** and permanently. This was already working. | Setting read back off the live server today: bounce detection and spam-complaint detection both `true`. |
| **A bounce is now written against the original email**, so the reported bounce figure can move off zero. | Both routes a bounce arrives by share one piece of code, with automated tests that fail the build if the mailbox route stops marking the record. Live on the production server on 27 August, confirmed by reading the running version back off the server itself rather than trusting the deployment — see the note below. |

On the dead-mailbox fix specifically, we did not settle for "the code is
deployed". The scheduled job that checks all the mailboxes publishes its results,
and we watched the number change at the moment the fix went out:

| Run | Result |
|---|---|
| 08:22, before the fix | 35 checked, 27 succeeded, **8 failed** |
| 09:16, the run that applied the fix | 35 checked, **8 failed** |
| 09:21, the very next run | **27 checked, 27 succeeded, 0 failed** |

Thirty-five became twenty-seven. Exactly eight mailboxes dropped out of the
checks, which can only happen if they were genuinely marked as disconnected. As
of the most recent run — 26 August, 18:55 — it still reads 27 of 27, 0 failed.

On the bounce-recording fix, we applied the same standard rather than assuming a
deployment worked. The live server publishes which version of the software it is
actually running. After the change went out we read that back and confirmed it
matched the change — version `b358dcd`, built 27 August. We also read the live
server's own settings back to confirm bounce detection was switched on, which it
was, and had been throughout.

One honest limit on this fix: **it can only act on bounce notices that arrive
from now on.** It has not been observed catching a real one yet, because sending
is paused. The moment sending resumes, each mailbox check records how many
bounces it wrote down, so the first real one is visible without anybody having to
take our word for it. We would rather tell you that than describe a fix as proven
when what has been proven is that it is correctly built and correctly installed.

---

## What is still outstanding

We would rather list these plainly than have you find them later.

1. **The reported bounce figure will read zero until sending resumes.** The
   underlying defect is fixed (finding 2 above), but the fix applies to bounce
   notices arriving from now on — it cannot go back and re-read the 426 already
   stored, for the reason in finding 3. So the figure is now trustworthy in the
   sense that it will move when a bounce happens; it is not yet a measurement.

2. **The 4-5% figure stays an estimate until real sending resumes.** The 426
   stored bounce notifications cannot be read retrospectively, because the Gmail
   ones were saved without their contents. The fix applies to messages arriving
   from now on. Roughly a fortnight of live sending will turn the estimate into a
   measurement.

3. **The eight mailboxes have not been reconnected.** The system now reports them
   correctly; nobody has acted on the report. Six need someone at the customer to
   sign in again. Two, at Chevron Security, are gone permanently and need
   replacement addresses or removal from the account.

4. **Volume restarts at the bottom of the ramp.** This is the correct behaviour
   but it has a real cost, and you should hear it from us rather than discover
   it: every mailbox begins at **5 emails a day**, and 30 a day is **25 sending
   days away** — roughly five working weeks of daily sending. Total capacity
   across the fleet today is about **275 emails a day**, not the 1,350 that 45
   mailboxes at 30 a day would suggest.

5. **Nothing automatically slows sending down if complaints rise.** We now
   capture spam complaints, but no part of the system reacts to the rate — a
   person has to notice. Google's own guidance is a behavioural rule ("reduce
   volume until the error rate falls, then increase slowly"), and we have not
   built that. It needs real sending data before it can be built responsibly; a
   throttle written against a rate that is currently zero would be a control that
   never fires, which is worse than none.

6. **No customer has a matching link domain set up yet.** Until one does, opt-outs
   work by replying to the sender rather than by clicking a link. That is
   compliant and it is the safe option — it means the email carries no web
   address other than the sender's own — but it is a slightly higher-friction
   experience than a one-click unsubscribe. Setting up a matching link domain per
   customer (a single DNS record on their side) restores the click. It is
   optional, and it is the only item on this list that would ask anything of your
   customers' IT teams.

7. **The last outreach send was 3 July.** Reputation decays with inactivity, so
   every mailbox should be treated as cold when sending resumes, regardless of
   what it did in June.

---

## What we would ask of you

- **Decide who chases the six expired Google sign-ins.** Nothing sends from those
  mailboxes until someone does.
- **Decide what happens to the two deleted Chevron Security accounts** — replace
  the addresses, or take them off the account.
- **Accept the five-week ramp**, or tell us you want it discussed. We would
  strongly advise against shortcutting it; it is the single change most likely to
  keep messages out of junk folders from here on.
- **List quality is now the main lever on the bounce rate.** At 4-5% the software
  is not the bottleneck. Address verification before sending is not currently
  part of the system and would be a separate piece of work if you want it.

---

## Where these numbers came from

Every figure above came from one of four places, all checked on or before
27 August 2026:

- **The system's own production records** — send counts, stored bounce
  notifications, and per-mailbox sending days, read without modifying anything.
- **The live server's configuration**, read back directly today rather than
  assumed from the code.
- **The public run history of the scheduled jobs**, which is where the 35-to-27
  proof came from. It is a record neither we nor anyone else can edit after the
  fact.
- **Google's and Microsoft's own published sender guidance**, fetched directly.
  We removed a "2% bounce rate" rule from our own standards during this work
  after finding it came from a vendor guide and not from either provider.

Nothing in this document rests on a test send made on your customers' behalf. The
one real email sent while proving the system works was sent from a BidlowAI
mailbox, to an address we control, on 26 August.

If any of it does not match what you are seeing, tell us which line and we will
go back to the source.
