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

## If something looks wrong

Create the `HALT` file. Nothing is mid-flight that cannot be picked up again —
each cycle commits its own work, and anything unfinished is just not done yet.
Then read the newest file in `log/` to see what the last cycle actually did.
