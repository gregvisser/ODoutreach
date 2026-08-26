# How ODoutreach is meant to look, and why

Plain-English companion to `.bidlow/DESIGN.json`. That file is the machine-readable
version and the one the build actually checks; this one is for reading.

Written 2026-08-26.

---

## The problem this solves

You have asked three times that BidlowAI systems stop looking generic. Nothing was
ever written down, so every new screen was a fresh decision made in isolation, and
each time the answer drifted back towards the framework's default look. There was no
document to disagree with, so there was nothing to hold anyone to.

This is that document.

## The direction: "Ledger & Rail"

**The idea in one sentence:** an outreach console is a record of things that have left
the building and cannot be called back, so it should read like a well-kept ledger, and
anything capable of leaving the building should be visibly marked as such.

Three principles follow from it.

**1. Consequence is drawn, not just confirmed.** At the moment, the only thing that
tells you an action is irreversible is a dialog you have already stopped reading. The
design reserves one visual mark — a hard 3px edge down the left of a surface, the
"send rail" — for one meaning only: this represents mail that has left, or is about to
leave, for a stranger. It is never used for decoration. Its colour says where on that
one-way trip the mail is: queued, sent, delivered, bounced, suppressed.

**2. A record, not a dashboard.** Staff live in this all day, mostly in lists of
things that happened. Lists reward density, alignment and good typesetting. They do
not reward boxes inside boxes or drop shadows pretending to be structure.

**3. Calm chrome, loud state.** Almost everything on screen is a quiet near-grey with
a faint green in it. That is deliberate, so that the handful of genuinely coloured
pixels are always something that needs a decision — a bounce, a dead mailbox, a
suppression. Colour is treated as scarce.

**Why this isn't generic:** the escape from a template look is not more decoration. It
is one idiom the product has earned and no template ships, applied with discipline.
No off-the-shelf admin theme has a marker for irreversibility, because no off-the-shelf
theme knows which of its rows can reach a stranger's inbox. This one does.

## What was actually built this cycle, and what was not

Being precise about this, because "design system delivered" is the kind of phrase that
sounds like a finished product and usually isn't.

**Built and working:**

- The direction, the colour tokens, the typography rules and the anti-goals are
  written down in `.bidlow/DESIGN.json`.
- A build gate (`src/lib/design/design-system.test.ts`) that reads that file and the
  real stylesheet and fails if they disagree, or if any colour combination drops below
  the accessibility standard. It runs with every other test, so it blocks merges.
- Two real accessibility defects found and fixed (below).

**Specified but NOT built** — the two things that would actually stop it looking
generic:

- The send rail.
- Live/dry banding: making "this will really send" a visible property of the surface
  rather than a sentence you have to read.

Both need the UI consolidation (queue item 7, PR #196) to land first, because that
change moves the screens they would attach to. **Nothing about the app looks different
today except the two colour fixes.** The design work is decided and recorded; it is
not yet applied.

## The two things the gate caught on its first run

Both were already live, both had been shipped and never noticed, and neither was found
by looking — they were found by measuring.

**1. The outline around every text box was too faint to see.** Text fields, text areas
and dropdowns in this app have no background of their own; a thin border is the only
thing on screen telling you a control is there. That border was measured at **1.21 to
1**, against an accessibility requirement of **3 to 1**. In practice: on a bright
screen, or for anyone with reduced vision, the form fields were close to invisible
until clicked. Now fixed — the outline is noticeably darker.

**2. The red used for warnings and delete buttons was just under the legibility
threshold.** Measured at **4.44 to 1** against a required **4.5 to 1**. Fixed by
deepening the red very slightly. It is the same red; it is a shade stronger.

**What you will notice:** form fields across the whole app now have a clearly visible
outline instead of a nearly invisible one, disabled fields look properly greyed out
rather than nearly white, and warning red is a touch deeper. Nothing moved, nothing
was rearranged.

## Three problems found and deliberately left alone

Recorded with their measurements in `.bidlow/DESIGN.json` under `open_defects`, so
whoever picks them up starts from evidence rather than from scratch.

- **The delete button's label still fails the standard** (3.72 to 1, needs 4.5). Its
  text sits on a faint tint of its own colour rather than on the page. Fixing it
  properly means changing the button itself to a solid red with white text, which is
  a change to a component used everywhere — not a colour tweak. It should be fixed.
- **Two of the five chart colours are too pale in light mode** (2.51 and 2.39, need
  3.0). The obvious fix — darkening them — makes one of them nearly identical to
  another series, so you would trade a measured problem for an unmeasured one. This
  needs a proper pass over the chart palette, including how it reads for colour-blind
  users.
- **Cards and tabs carry small drop shadows** left over from the framework defaults,
  against the rule this document sets. Removing them changes every screen, so it
  belongs with the consolidation work.

## Something worth telling you about the gate itself

The first version of the check that bans the default-template purple could never have
worked. It compared the design document against itself, so it would have happily passed
while the actual stylesheet was purple.

That was only found by deliberately breaking the code and checking the alarm went off —
turning `--primary` purple in the stylesheet and watching which tests failed. It was
caught, fixed, and re-proven. Every arm of the gate has now been broken on purpose and
watched fire: a changed colour, an undeclared colour, a purple colour, a button shrunk
below the minimum size, and pure black on pure white.

This matters because a gate that reports success without ever being able to fail is the
defect this project has hit eight times in a week. The ninth was in the gate written to
prevent the ninth.

## What is honestly still owed

This document does **not** claim the product meets WCAG 2.2 AA. It claims the **colour
system** does, and names exactly what has not been checked. Four accessibility criteria
are machine-checked on every build. The rest — keyboard operation, whether the sticky
header ever covers the row you have selected, whether any status is signalled by colour
alone — are written down as commitments and have not yet been checked by hand.

And the one real gap underneath all of it: **nobody has watched a member of OpensDoors
staff work in this product for an hour.** The claim that the reply inbox is the screen
that matters most is inferred from the code, not observed. That is the same discovery
gap the ASK stage still has open, and an hour of watching could change parts of this
document.

## Open questions: 2

1. The two signature elements — the send rail and live/dry banding — are the whole of
   what stops this looking like a template, and they are blocked behind the UI
   consolidation (PR #196). Do you want that unblocked next?
2. Should the delete button be reworked to solid red with white text? It is the fix for
   a real accessibility failure on a control that destroys things, but it changes how
   every delete button in the product looks.
