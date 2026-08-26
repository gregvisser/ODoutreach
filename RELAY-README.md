# The relay — how to start it, stop it, and check on it

The relay lets Claude keep working on ODoutreach while you are away. You start it
once; it picks up a new instruction every minute, does the work, and writes down
what it did in plain English so you can read it over coffee.

## How to start it

Open PowerShell in this folder and run `.\relay-watch.ps1`. It prints a line
saying it has started and then goes quiet until there is work to do. Leave the
window open — closing it stops the relay.

## How to stop it

Create a file called `HALT` inside `.bidlow\relay\` — it can be empty, the name
is all that matters — and the relay stops within a minute without finishing what
it was doing. Closing the PowerShell window stops it immediately. It also stops
itself after 40 cycles, or if the safety gate is off, and writes the `HALT` file
to say why.

## How to tell if it is running

The PowerShell window prints a line every time a cycle starts and finishes. If
you have closed the window, open `.bidlow\relay\STATUS.json` — it holds the
cycle number, what happened last, and when. Every cycle also leaves a numbered
file in `.bidlow\relay\log\` describing what changed and what was decided.

---

# You should not have to watch it

Three things changed on 2026-08-26 so that the relay looks after itself. The
short version: **a stuck job no longer costs you the night, you find out by
email, and a reboot does not quietly end the run.**

## 1. A stuck cycle gets 45 minutes, then it is killed

Sometimes the agent hangs — not crashes, just stops, with nothing printed. It
used to sit there forever, and the only cure was a person noticing and closing
the window. Every hour after that was wasted.

Now each cycle has 45 minutes. If it is still going after that, the relay kills
it **and everything it started**, writes the cycle up as `timed-out`, and takes
the next item off the list by itself. You lose one item instead of a night.

Two things worth knowing:

- Killing a job does not undo what it already did. If it had already changed
  files, those changes are still there. The cycle log says so plainly rather
  than pretending the item is untouched.
- 45 minutes is generous on purpose. The longest real cycle so far took about
  twenty, so a normal slow job will never be cut off.

## 2. You get an email when it goes wrong

You already learn about a failed overnight job from your inbox. The relay now
works the same way. An email arrives when:

- a cycle is killed for running too long,
- a cycle fails or cannot start at all,
- the relay stops completely (it hit the 40-cycle limit, or the safety gate was
  off), or
- it refuses to start because its own self-check failed.

Each email says what happened, **whether the relay is still running**, and which
log file to open. Most of them end with "you do not need to do anything
tonight", because the relay has already moved on.

There is no email when everything is fine. That is the one difference from the
daily digest: the digest is a dead man's switch where silence means trouble,
whereas here silence means the relay is working.

**Where the email comes from.** It uses exactly the same Resend account and the
same address as your existing job alerts — nothing new to set up, and no new
place to change your email address. The send itself happens up on GitHub rather
than on this laptop, because that is where the key already lives and it should
not be copied onto a machine. A side benefit: every alert leaves a record in the
Actions history, so "did it actually send?" is something you can check rather
than hope.

**What would stop it working.** If this laptop has no internet, or the GitHub
sign-in expires, no email can go out. The relay checks the sign-in every time it
starts and refuses to run if it is broken, so you find out at the start rather
than on the night you needed it.

## 3. It starts itself again after a reboot

Windows restarts for updates, usually overnight, and that used to be the silent
end of a run.

Run this **once**, in PowerShell in this folder:

```powershell
.\relay-install-task.ps1
```

It prints the task back out so you can see it really registered. From then on
the relay starts on its own whenever you log in. You do not need to be an
administrator.

Other things you can do with it:

```powershell
.\relay-install-task.ps1 -Check    # is it installed?
.\relay-install-task.ps1 -Prove    # does it really start? (changes nothing)
.\relay-install-task.ps1 -Remove   # undo it
```

`-Prove` is the interesting one. "The task is in the list" and "the task
actually starts the relay" are different claims, and only the first is easy to
check. `-Prove` runs a harmless twin of the task that loads the relay and stops
without doing anything, then reads the result back out of Windows. If it says
PROVEN, the scheduling really works.

**If you deliberately stopped the relay, a reboot will not restart it.** The
`HALT` file survives, and the scheduled task respects it. Starting it by hand
with `relay-start.cmd` is what clears `HALT` — that is the difference between
the two, and it is deliberate.

**If you move or rename this folder, the task will point at nothing.** Run
`.\relay-install-task.ps1` again to fix it.

## The self-check when it starts

Every time the relay starts, it spends about fifteen seconds proving its own
safety machinery still works: it starts a job designed to hang, checks that the
45-minute rule really kills it and everything underneath it, and checks that it
could email you. **If any of that fails, the relay refuses to run** and writes
`.bidlow\relay\SELFTEST-FAILED.md` explaining what broke.

This is deliberate, and it is the reason to trust the two features above. A
timeout only matters on the one night something hangs — exactly the kind of
thing that can quietly stop working for months with nobody noticing. This
project has already found eight separate cases of something that was built,
wired, reported success, and never actually ran. Checking it every single start,
on this machine, against the real code, is how this one avoids becoming the
ninth.

You can run the same check yourself at any time with `.\relay-selftest.ps1`.

---

## The one rule that is not on trust

While the relay is running, **real email can only be sent for the Bidlow
client**. Every other client can be worked on, tested, measured and reported
on — nothing leaves the building for them.

That rule is not written only here. It is enforced in the code that actually
sends, at the moment of sending, and it refuses rather than warns. If the
allowlist is empty it refuses *everything*, including Bidlow — a gate that is
unsure is a gate that says no.

The relay checks that the gate is switched on **before every cycle**, by asking
the live site. If the site says the gate is off, if no client is allowlisted, or
if the site cannot be reached at all, the relay stops and writes `HALT` rather
than running without protection.

Your own sending is untouched. The gate only applies when there is no signed-in
person behind a send, so you and your staff work exactly as before.

## What the files are

| File | What it is |
|---|---|
| `NEXT.md` | The instruction for the next cycle. The relay picks it up and it disappears. |
| `CURRENT.md` | What the relay is working on right now. |
| `HALT` | If this exists, everything stops. Delete it to allow the relay to run again. |
| `STATUS.json` | Cycle number, last outcome, time. |
| `log/` | One readable file per cycle. |
| `SELFTEST-FAILED.md` | Only exists if the relay refused to start. Says what broke. |

And in the repository folder itself:

| File | What it is |
|---|---|
| `relay-start.cmd` | Double-click to start the relay by hand. Clears `HALT` first. |
| `relay-watch.ps1` | The relay itself. |
| `relay-selftest.ps1` | Proves the timeout and the alerting work. Runs at every start. |
| `relay-install-task.ps1` | Run once so the relay restarts after a reboot. |

## If something looks wrong

Create the `HALT` file. Nothing is mid-flight that cannot be picked up again —
each cycle commits its own work, and anything unfinished is just not done yet.
Then read the newest file in `log/` to see what the last cycle actually did.
