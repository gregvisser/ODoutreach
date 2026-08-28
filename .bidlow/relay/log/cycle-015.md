# Cycle 15 - timed-out



KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (9 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.



Started 2026-08-26 15:55:49, took about 45 minutes.

How it ended: killed at the 45 minute deadline.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: src/server/suppression/family-discovery-run.ts, suppression/page.tsx, bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 15 - queue item 26

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE SEVENTH INSTANCE OF THE HOUSE DEFECT, AND IT IS SITTING ON GREG'S NUMBER ONE REQUIREMENT. AUTOMATIC RELATED-DOMAIN DETECTION IS BUILT, MIGRATED AND TESTED — AND HAS NO CALLER AND NO SCREEN.** Found 2026-08-26 by walking the live site in Chrome (the relay cannot: `claude -p` runs with `--allowedTools Write,Edit,Read,Glob,Grep,Bash`, so item 16 could not be done from here). EVIDENCE, all checkable: (a) `src/server/suppression/family-discovery-run.ts` exports `discoverLinksForClient`, `planClientFamilyProposals`, `persistProposalPlans`; `family-proposals.ts` exports `listPendingFamilyProposals`, `confirmFamilyProposal`, `rejectFamilyProposal`; there are FOUR test files and a shipped migration `20260824180000_suppressed_domain_family_proposals`. (b) `grep -rl family-discovery-run src --include=*.ts` outside tests returns ONLY the file itself. Nothing imports it. (c) No workflow in `.github/workflows` mentions it. (d) `src/app/(app)/clients/[clientId]/suppression/page.tsx` imports `DomainFamilyPanel` and `listDomainFamiliesForClient` — the MANUAL families — and does NOT import `listPendingFamilyProposals`. (e) `do-not-contact-actions.ts` has only `addToDoNotContactAction`, `addDomainToFamilyAction`, `removeDomainFromFamilyAction`. There is no confirm/reject action. CONCLUSION: the proposals table can never be written to, so the panel can never show anything, so the ONLY route is the manual Company + Their domain form — which is exactly what Greg forbade: *"there must be no human entering the domain or email addresses manually, it must be automated... human error is the single thing causing do not contact emails to be contacted."* Worse, the live page tells the customer the opposite of what Greg told them in the meeting. It currently reads, twice: *"nothing can tell they are the same company without being told"*. The owner will read that tomorrow. WHAT TO DO: (1) give the discovery a caller — a server action on the Do-not-contact page ('Find related domains now') AND a scheduled run, so it is not a button nobody presses; (2) surface pending proposals on `/clients/[clientId]/suppression` above the manual form, each with Confirm and Reject, wired to `confirmFamilyProposal` / `rejectFamilyProposal`; (3) rewrite the two paragraphs of copy so they describe what the system now does, not what it cannot do; (4) run discovery for real against the OpensDoors client and leave real pending proposals on the screen for the demo. Proposals are inert until confirmed, so running discovery sends nothing and blocks nobody — it is safe to run in production. The measured expectation from the earlier analysis: about 7 correct links, 13 contacts, once shared infrastructure (`outlook.com` and friends) is excluded — do NOT let raw SPF includes merge 238 unrelated domains. PROVE IT FIRES: a screenshot or a transcript showing a proposal that the machine created, not one you inserted by hand.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, an
  irreversible one-way door - stop and write down the question instead.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 15`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did





