# Set up the relay, and the one rule that must never be a prose rule

This is the LAST prompt Greg hands over by hand. After this, the loop runs and
he reads the results.

Greg's decision, verbatim:

> *"Option 3, however, if any emails or deleting gets done, it can only happen
> on the bidlow client in the ODoutreach system. all other clients can be worked
> on to prove the system, but sending and deleting can only happen on bidlow
> customer... if a question blocks you and claude code from working, use your own
> recommendations to move forward... I put you in control along with claude code
> to get this done."*

Build this in order. Do not start autonomous work until steps 1 and 2 both pass.

---

## STEP 1 — The safety gate. Code, not prose. Build it FIRST.

**The invariant:** no real email may be sent, and no client data deleted, for
any client except **Bidlow**. Every other client may be built on, tested,
refactored, measured and reported on — but nothing leaves the building and
nothing is destroyed.

A rule written only in a markdown file is a rule that gets forgotten by cycle
forty. **Enforce it where it cannot be skipped.**

You know this codebase far better than the brief does, so design the enforcement
and justify it. It must satisfy all of:

* A send to any non-Bidlow client is **refused at the point of dispatch**, not
  merely discouraged upstream. `evaluateSendGovernance` already exists and is
  the obvious home.
* Destructive operations — dropping rows, deleting contacts, deleting mailboxes,
  hard-deleting a client — are refused for non-Bidlow clients.
* It fails **closed**. If the allowlist is missing, unreadable, or the client
  cannot be identified, refuse. Never default to allowing.
* It cannot be disabled by editing one line without a test going red.
* **Human-operated use is unaffected.** Greg or his staff sending normally must
  not be blocked. Gate on the autonomous context, not on the action alone.

First, confirm Bidlow actually exists as a client in ODoutreach and report its
identifier. If it does not exist, STOP — the whole permission model rests on it.

Red first. The test that matters: a send for Train Hugger is refused, a send for
Bidlow is allowed, and a missing allowlist refuses both.

## STEP 2 — The relay

Create `.bidlow/relay/` in ODoutreach:

```
NEXT.md      the prompt Claude (Cowork) writes for you
CURRENT.md   what you are working on now
HALT         if this file exists, everything stops
STATUS.json  cycle count, last outcome, timestamp
log/         one plain-English file per cycle
```

Then a watcher Greg starts once — a small PowerShell script in the repo root,
`relay-watch.ps1`:

* Every 60 seconds, look for `NEXT.md`.
* If `HALT` exists, exit cleanly and say so.
* If the cycle count in `STATUS.json` exceeds **40**, write `HALT` and exit.
  A runaway loop must die on its own.
* When `NEXT.md` appears: move it to `CURRENT.md`, increment the count, run
  Claude Code headless on it, then write a plain-English outcome to `log/`.
* Loop.

Keep it simple and readable. Greg is not a coder and may need to read it.

Write `RELAY-README.md` next to it: how to start it, how to stop it (create the
`HALT` file, or close the window), and how to tell if it is running. Three
sentences each, plain English.

## STEP 3 — Prove the relay works before trusting it

Write a trivial `NEXT.md` yourself — something harmless like "append one line to
`.bidlow/relay/log/hello.txt` and stop" — start the watcher, and confirm the
whole cycle runs: picked up, executed, logged, counter incremented.

Then confirm `HALT` actually stops it.

Do not skip this. Three times this week something was built, wired, and never
actually fired. This is the fourth chance to make that mistake.

---

## The work queue, once the relay is live

Greg's goal: **ODoutreach through all six stages, with a working UX and UI.**

Current state, measured tonight:

| Stage | State |
|---|---|
| ASK | 7 open — real discovery gaps, see below |
| CLASSIFY | **closed** |
| CHECK | done |
| PLAN | done — but no DESIGN.json exists |
| BUILD | clear |
| PROVE | 8/10 engineering, 6.8/10 customer-ready. Needs 8/8 |

Known work, roughly in order of what unblocks what:

1. **The eight dead mailboxes** — `EIGHT-DEAD-MAILBOXES.md`. Note that six need
   the CLIENT to sign in, which no amount of permission lets you do. Prepare the
   ground; the reconnection itself waits for Greg regardless.
2. **Loading performance.** Greg: *"the system takes very long to load."*
   MEASURE it before changing anything — which pages, how slow, and where the
   time actually goes. `loadClientWorkspaceBundle` runs 8 parallel queries and
   is the obvious suspect, but a suspect is not a cause.
3. **Reply claiming** — Part 2 of `ALERTS-AND-CLAIMING.md`, still unstarted.
4. **UI consolidation** — PR #196, held because staff training references the
   old layout by name with screenshots. Update the training in the same change.
5. **DESIGN.json** — the third PLAN artefact. Direction, tokens, signature
   elements, anti-goals, WCAG 2.2 AA. Greg has asked repeatedly that each system
   stop looking generic. Propose a direction; do not wait to be told one.
6. **ASK's seven** — three are real discovery gaps (three real cases traced end
   to end, frequency counts, an exception register). Two are already answered in
   DATAMODEL.json and need carrying across. One is trivial (`access_level` was
   async, via Greg).
7. **PROVE to 8/8** — the largest single reason engineering is 8 and not 9 is no
   end-to-end coverage of the journey that reaches a third party's inbox.

You may use the Chrome extension where it genuinely helps — Greg has approved
it. Measuring real page load is exactly such a case.

## Standing rules for every cycle

* **Never send or delete for any client except Bidlow.** Everything else is
  fair game.
* Commit, push, open a PR and deploy when confident. Verify the deployed commit
  by hash against `origin/main` through the direct App Service URL.
* **When a question blocks you, decide and record the decision** rather than
  stopping. Greg has explicitly asked for this. Write what you decided and why,
  so it can be reversed if wrong.
* Write a plain-English cycle log Greg can read over coffee. Not a diff — what
  changed, what it means, what you decided on your own.
* If you find something that contradicts these instructions, stop and write it
  to `NEXT.md` as a question rather than proceeding on a bad premise.
