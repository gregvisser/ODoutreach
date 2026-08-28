# The relay did not queue anything

Written 2026-08-28 06:31:25.

The next row in order is #38, and the relay could not read it.

It is shaped like a queue row, but its status cell does not start with any status
the relay recognises. Those are: TODO, DONE, BLOCKED, PARTIAL, IN PROGRESS, WONTFIX.

This is the row exactly as it appears in QUEUE.md, line 308:

    | 38 | **DO NOT BUILD - TWO OWNER DECISIONS ARE OPEN, AND BOTH ARE ONE-WAY DOORS. Brief: `C:\Bidlowbusiness\_odoutreach-handover\OWNER-FEATURE-REQUESTS.md`.** This row exists so no cycle starts this work by accident. **(1) May a machine send for clients other than `bidlowai`?** `autonomous-actor-guard.ts` refuses it today, at dispatch, deliberately. Do not lift it on your own judgement. **(2) Does open/click tracking come back?** Half the owner's AI wishlist needs it, and it is the RECORDED CAUSE OF THE QUARANTINE - links on the app domain while From: was the customer's. The switch was written to FAIL CLOSED and the code says OpensDoors "have been told in writing that open tracking is off". Greg's standing rule: aligned domain or no link. **BLOCKED until decided:** opens-based priority, click-to-call-task, hot-prospect alerts, subject-line retry on non-open. **BUILDABLE the moment decision 1 lands, needing NO tracking:** reply classification (positive / later / referral / not interested / unsubscribe), stop-on-reply, AI writing a whole SEQUENCE rather than one email, campaign quality score, AI-chosen send times, rep performance dashboard, best-message-by-job-title. Reply classification first - routing a "yes, happy to talk" to a human in minutes is worth more than every open-count feature combined. **Guardrails survive all of it:** suppression checked at queue AND dispatch, per-mailbox caps and warm-up are ceilings, an AI-drafted email is still an email and every send rule applies unchanged. | SUPERSEDED 2026-08-28 - Greg made BOTH decisions. See PHASE-2-SPEC.md. |

THE QUEUE IS NOT EMPTY - this is a formatting fault in one row, and there may be
perfectly good work behind it. Fix that row's status cell and the relay will pick
up again on its own within 5 minutes. Nothing has been skipped and
nothing has been changed.
