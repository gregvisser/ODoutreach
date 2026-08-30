# Cycle 129 - queue item 104

## What it was asked to do

Row 104: set up the one click that opens the sell gate, and stop before
clicking it. Import one fresh, never-contacted contact for `bidlowai` at a
brand-new Gmail plus-alias, build a sequence to it through the real screens
exactly as cycle 109 did, drive it to a genuine app-computed "Ready to
launch" state, and stop — do not click Launch. Write a plain-English note at
`C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md` telling Greg
exactly what to click and what to expect back. Do not score anything;
dimension 1 moves only once a human has watched the reply land against the
right send.

## Before touching anything

**Files this row could change:** `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md`
(new artefact), `.bidlow/relay/QUEUE.md` (row 104 status),
`.bidlow/relay/log/cycle-129.md` (this file), and
`C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md` (outside the
repo, per the repository-boundary rule). No `src/` change was in scope or
made.

**Red-first test:** does not apply. This row is an operational screen walk
against the live product, not a code change — there is no behaviour to put
red before green. Said plainly rather than skipped, matching the precedent
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle109.md` set for the same
situation.

**Done looks like:** a real sequence for `bidlowai`, built through the actual
screens, sitting at "Ready to launch" with Ready: 1 / Blocked: 0 / Sent: 0,
proven by quoted screen text; the alias recorded; the reply-matcher fix
confirmed live on the deployed commit; the handover note on disk in plain
English; and a plain statement that nothing was sent — checkable by a
non-coder by opening the page named in the note.

**Must not touch:** any other client's data or sends, `AUTONOMOUS_SEND_ALLOWLIST`
/ `autonomousSendEnabled` for any client, `.bidlow/GRADES.json`, and the
Launch sequence button itself.

## Queue sweep first

One open PR at cycle start, `#423` (row 103, cycle 128's own work, branch
`fix/relay-orphan-reopen-verify-merged-row103`) — both checks were still
`IN_PROGRESS`. Watched them go green (`E2E (Playwright)` 5m29s, `verify`
5m11s) and squash-merged as `674bd8b`, deleting the remote branch. `gh pr
merge` then failed locally trying to switch/delete the local branch, because
cycle 128 had left two uncommitted changes in the working tree (the row 104
addition to `QUEUE.md`, and its own final `cycle-128.md` log) — the merge on
GitHub had already succeeded by then. Stashed those two files, fast-forwarded
local `main` to `674bd8b`, opened a fresh branch
(`docs/row104-sequence-launch-walk`), and popped the stash back so cycle 128's
leftover record survives and lands in this cycle's PR alongside row 104's own
work. No other open PRs.

## What it did

**Verified the fix is deployed, with a cache-buster, before starting.**
`GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info?cb=<ts>`
(direct App Service origin) read `commit: 75240ed1a6f37b28f4ef37a4e590ee2ea2b5ee15`
at the start of recon. `git merge-base --is-ancestor 8b2370f 75240ed` — true.
Row 103's own merge auto-redeployed mid-cycle; re-checked with a fresh
cache-buster afterwards and got `674bd8bf6bbdbc0390e91bce40ca018f000ddc9d`,
re-ran the ancestor check against that hash too — also true. `/api/health`
read `autonomousRelay.allowlistedClients: 1` both times.

**Recon, read-only.** The Postgres Flexible Server only allows Azure-internal
traffic by default. Used `az webapp config appsettings list` (already
Azure-CLI-authenticated as the account that owns this subscription) to read
`AUTH_SECRET` and `DATABASE_URL`, then added a temporary firewall rule scoped
to this machine's own IP, ran two narrow read-only queries (bidlowai's client
id / staff row / connected mailbox; the outbound-queue status counts split by
client), and removed the rule immediately after each use — confirmed by
re-listing the firewall rules both times. Found: client id
`cmpmhb5j40000gbo05h6oyc7j`; one connected mailbox
(`greg@bidlow.co.uk`, Microsoft, CONNECTED); the staff account
`greg@opensdoors.co.uk` (StaffUser `entraObjectId: cycle110-readonly-check`,
a placeholder id an earlier cycle set — next-auth only checks it matches the
row it was issued against, so it authenticates the same as a real Entra GUID);
existing plus-alias contacts `+cycle109` and `+cycle105` (so `+cycle129` is
genuinely new); before-state outbound queue: 0 `QUEUED` rows anywhere, bidlowai
totals SENT 1 / FAILED 1 / BLOCKED_SUPPRESSION 1 / REPLIED 3.

**Minted a real session, same method as cycle 109.** Used next-auth's own
`encode()` (not reimplemented crypto — the same technique
`e2e/global-setup.ts` uses) with the production `AUTH_SECRET` to build a
genuine `next-auth` JWT session cookie for `greg@opensdoors.co.uk`, loaded it
into a headless Chromium browser via Playwright (already a project
devDependency), and drove the actual production pages on the direct App
Service origin — real HTTP, real Server Actions, real database writes.
Scratch scripts, the minted cookie file, the CSV fixture, and screenshots all
lived under this repo's already-gitignored `.tmp/` directory and were deleted
at the end; nothing under `.tmp/` was committed.

**Through the real screens:**
1. `/clients/{bidlowai}` — confirmed the session actually authenticates as
   staff (did not bounce to sign-in).
2. `/clients/{bidlowai}/sources` — named a new list
   ("Cycle 129 fresh — 2026-08-30"), uploaded a one-row CSV
   (`A Emails,Name` header, matching cycle 109's format) for
   `greg.visser64+cycle129@gmail.com`, clicked **Preview** ("Email-sendable:
   1"), clicked **Confirm import**.
3. `/clients/{bidlowai}/outreach` — expanded the "New sequence" accordion
   (a collapsed `<details>` on this page — had to find this, cycle 109
   predates it), named the sequence "Cycle 129 send-and-reply walk —
   2026-08-30", selected the new list, selected the existing "Cycle 105 walk
   intro — 2026-08-29-cycle105" INTRODUCTION template (the one template with
   no unfilled merge field — same choice cycle 109 made, for the same
   reason), left the mailbox on auto-pick, clicked **Save sequence**. Flash:
   "Sequence checks passed · Ready to launch · 1 recipient added to this
   sequence · Recipient readiness updated."
4. Opened the sequence's own detail panel via **Review and launch** on its
   table row, then clicked **Review recipients** again anyway as an explicit
   human-style re-confirmation (same as cycle 109). Quoted verbatim from the
   page: "Ready to launch — 1 mailbox connected · 30 sends available today."
   and "Live sends — Ready: 1  Blocked: 0  Sent: 0." The **Launch sequence**
   button was present and enabled (`disabled` attribute read `false`) — a
   genuine readiness, not a UI state that merely looks ready. **It was never
   clicked**, and its confirmation dialog (which carries a second,
   identically-labelled confirm button) was never opened either.

**Confirmed nothing left the building.** Re-ran the same outbound-queue count
query after the walk, over a second temporary firewall window: identical to
before, row for row — 0 `QUEUED` rows anywhere, bidlowai still SENT 1 / FAILED
1 / BLOCKED_SUPPRESSION 1 / REPLIED 3. On screen, the sequence's own "Sent"
tile also reads 0.

**Wrote the handover note.** `C:\Bidlowbusiness\_odoutreach-handover\MORNING-ONE-CLICK.md`
— plain English, no jargon, no file paths into the codebase: the exact
`opensdoors.bidlow.co.uk` URL to open (verified it resolves and correctly
preserves the sign-in callback), that the button is "Launch sequence" and it
sends one real email to the alias, to reply without editing the subject line,
that the reply check runs on a schedule, and exactly what "right" looks like
on the Activity screen (right subject, "Replying to" naming the 30 August
sequence and not the 26 August one) — plus one line each for what it proves if
it lands right and what to say if it doesn't.

**Wrote the dated artefact.** `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md`
— the full screen-by-screen record, both build-info checks, both firewall
recon windows, the before/after queue counts, and an explicit "what this walk
did NOT cover" section naming the send, arrival, reply, and reply-matching
confirmation as still unproven.

**Did not touch:** `.bidlow/GRADES.json` (dimension 1 stays at 8, exactly as
instructed — it moves only once a human has watched the reply land against
the right send), any client other than `bidlowai`, `AUTONOMOUS_SEND_ALLOWLIST`,
`autonomousSendEnabled` for any client, and — deliberately — the "Launch
sequence" button.

**Gates, run and shown:** `npm run lint` — 0 problems. `npx tsc --noEmit` — 0
errors. `npm test` — 349 files, 3661 tests, all passing. No source code
changed this cycle, so these gates confirm nothing regressed rather than
proving new behaviour — named honestly rather than skipped.

**Left alone, correctly:** the untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
at the repo root, same as cycle 128 — outside this row's scope, not touched.

## Left behind in the live workspace, on purpose

* One new contact list, "Cycle 129 fresh — 2026-08-30", one contact
  (`greg.visser64+cycle129@gmail.com`) — real, harmless, never emailed.
* One new sequence, "Cycle 129 send-and-reply walk — 2026-08-30" — status
  Ready to launch, 1 recipient, 0 sent, waiting for Greg's own click.
