# Screen walk, part 2 of 2 (row 136, cycle 197) — Google logins, Training, Support, Settings, Dashboard, Reporting, Operations

**This row measures only. Nothing below was fixed, and no application code, schema, or
copy was changed.** No email was sent and no real client data was touched or deleted —
this was a source-code read, not a live click-through against production. Each finding
worth acting on is raised as its own queue row (154–159) rather than being fixed here;
two smaller findings are folded into row 148, which already owns "training content
drift," rather than duplicating that row.

## How this walk was done, and what it did not reach

This is Part 2 of the full tab-by-tab walk Greg asked for; Part 1
(`docs/ops/ROW135-SCREEN-WALK-PART1-2026-08-31-cycle195.md`) covered Replies, Clients,
New Client, Universe and Blocked Contacts. This row covers the remaining seven route
groups: `google-reconnects/`, `training/`, `support/`, `settings/` (including the
never-before-reviewed `settings/internal-seed`), `dashboard/`, `reporting/`, and
`operations/`.

**This walk was a source-code read, not a fresh live click-through**, for the same
reasons Part 1 gave: the row explicitly forbids building a new test harness or live
fixture seed to exercise these screens, and the scope (seven route groups) is large
enough that a full live walk risked not finishing inside one cycle. Four parallel
researchers each covered one area (google-reconnects alone, given its named priority;
settings; training+support; dashboard+reporting+operations), each tracing every claim to
file:line and quoting on-screen copy verbatim from source — the same evidence standard
Part 1 used.

**What this specifically means was not verified:** whether a real browser paints these
exact strings, whether the actual Google OAuth round trip behaves as the code implies,
whether a live click on the operations mutation buttons behaves exactly as traced, and
the true current count/state of greentheuk's mailboxes in the production database today
(the google-reconnects researcher cross-checked the still-current file paths and status
enum against the existing `docs/ops/2026-08-30-row118-google-mailbox-stranding.md` probe
rather than re-querying prod).

**Not reached at all:** nothing named in this row's scope was skipped — all seven route
groups were walked. Nested sub-routes within scope (e.g. `settings/internal-seed`,
`training/[moduleId]`, `training/staff-handover`, `support/[ticketId]`,
`reporting/detail`, `operations/outbound`) were all read.

## The two things the row asked to pay particular attention to — direct answers

**Does `google-reconnects` make a stranded mailbox (the greentheuk case) understandable
and recoverable by a non-technical operator?** Mostly yes, with one serious exception.
The per-row table correctly identifies a never-finished sign-in with a specific,
plain-English sentence ("Not connected — a sign-in was started and never finished. Press
Connect.") rather than a generic error, and its one action button routes to the real,
working Connect flow on the client's Mailboxes tab. **But the three headline summary
tiles at the top of the page — the numbers a time-pressed operator reads first — do not
count this failure mode at all.** "Already expired" is computed only from mailboxes that
are currently `CONNECTED` with a decaying token; a mailbox stuck in `PENDING_CONNECTION`
(exactly greentheuk's state, one row stuck 59 days) always shows as 0 on that tile no
matter how long it has been broken, even though the tile's own caption says "these
mailboxes are not sending." An operator could read "Already expired: 0" as "nothing is
broken" while real mail is not going out. See finding 1 below.

**Does `settings/internal-seed` do what its name implies, safely?** No, and the
correction matters: it does **not** seed or create any data at all — it is a small,
owner-gated allowlist table (email + label + active flag) that, when a currently-off
production flag is later turned on, exempts listed addresses from suppression/bounce
checks. It cannot touch any client's real contacts, sequences, or sends. The real gap is
that the allowlist itself has no domain or client scoping — any address an owner adds
becomes exempt across every client's outreach, not just a safe test client, once the flag
is flipped. Today (`INTERNAL_SEED_ALLOWLIST_ENABLED=false`) this is inert. See finding 5.

## Findings, ranked by how much damage each causes a real operator

### 1. Google-reconnects' headline "Already expired" tile reads 0 while a mailbox stuck at a half-finished sign-in — the exact greentheuk failure — goes uncounted

**Screen:** `/google-reconnects`.

`overdueCount` is `entries.filter((e) => e.countdown?.status === "overdue").length`
(`src/lib/mailboxes/google-reconnect-roster.ts:143`), and `countdown` is forced `null`
for any row that isn't currently `CONNECTED`
(`src/lib/mailboxes/google-refresh-token-expiry.ts:121-122`). A `PENDING_CONNECTION`
mailbox — a sign-in started and never finished, not an expired token — can never
contribute to that tile. The tile's own on-screen caption is "These mailboxes are not
sending" (`page.tsx:67`), which is equally true of these rows. The per-row table below
does surface them correctly (`needsAttention` defaults `true` with no countdown,
`google-reconnect-roster.ts:105`), so the information exists — but the summary numbers a
busy operator reads first mis-categorize this exact class of failure as "not currently a
problem." **Concrete failure:** an operator scans the three tiles, sees "Already expired:
0," and moves on, while a real client's mail is not sending. Raised as row 154.

### 2. Nothing outside a single-recipient daily digest ever surfaces a broken Google mailbox to anyone but Greg, and that digest doesn't even link to the fix screen

**Screen:** `/google-reconnects` and the alert digest.

The sidebar entry (`src/components/app-shell/nav-config.ts:71`) is a static label with no
badge or count. The one proactive signal that exists is a plain-text daily digest, and by
the code's own comment it has exactly one recipient — "Greg is the only recipient...no
fallback recipient" (`src/lib/alerts/alert-copy.ts:4,18-21`) — combined with the
already-known fact that its cron drifts 57-85%. When it does fire, the rendered text is
`"${entry.email} — ${entry.label}"` with no URL to `/google-reconnects` or to the client's
Mailboxes tab (`alert-copy.ts:312-339`), so even the one person who gets it has to already
know where to go. Any other staff member — the people this screen says it is "deliberately
open to all staff" for (`page.tsx:31-39`) — has no reason to ever open this URL. Raised as
row 155.

### 3. A support ticket can be resolved and closed with a blank resolution note, leaving the reporter with no idea what was fixed

**Screen:** `/support/[ticketId]`.

Ticket creation enforces a real minimum (title ≥3 chars, description ≥10 chars,
`src/app/(app)/support/actions.ts:37-41`), but resolution has no equivalent —
`resolveSupportTicket()` accepts `input.resolutionNote.trim() || null`
(`actions.ts:120-126`) and the Resolution card on the detail page simply doesn't render at
all when the note is empty (`src/app/(app)/support/[ticketId]/page.tsx:125-136`). The
reporter sees only a status pill flip to "Resolved." This is a live path any owner can hit
today, not a latent one. Raised as row 156.

### 4. Operations' three mutation buttons give zero feedback on success or failure, and on failure the page doesn't even re-render — a previously-flagged gap, confirmed still present

**Screen:** `/operations/outbound` (owner-only).

`form-actions.ts` wrappers (`requeueFailedFormAction`, `releaseStaleFormAction`) discard
the `{ok,error}` / `{released}` results their underlying actions return
(`form-actions.ts:9-24`, `actions.ts:65-99`), and `revalidatePath` is only called on the
success branch, so a refused mutation leaves the page showing stale data with no error
shown at all. None of the three buttons (Release stale locks, Requeue, Mark
VERIFIED_READY) has a pending/disabled state, unlike the equivalent
`AdminQueueDrainPanel` used elsewhere in the app, which does show a real result summary.
Not destructive — the underlying mutations are idempotent `updateMany`/`update` calls —
but an owner has no way to tell "it silently refused" from "it's still working" from "I
mis-clicked," and even a successful stale-release never reports how many rows it actually
released. This matches the exact defect class already named in project memory as
"optional polish, not blocking" for the `/operations` diagnostic buttons — this walk
confirms it is still true today. Raised as row 157.

### 5. The internal-seed suppression-bypass allowlist has no domain or client scoping — a latent risk that should be closed before the flag is ever turned on

**Screen:** `/settings/internal-seed` (never reviewed before this row).

`upsertInternalSeedAddress` only checks that the string contains `@`
(`src/server/internal-seed/seed-allowlist.ts:97-131`); the allowlist it writes to is
consumed globally, not per-client, at five call sites across suppression, bounce
handling, dispatch re-check, metrics and step-sends. On-screen copy calls the entries
"OpensDoors-internal test inboxes" (`settings/internal-seed/page.tsx:56-61`), but nothing
in code restricts additions to a safe domain or to the `bidlowai` test client. Confirmed
inert today: `INTERNAL_SEED_ALLOWLIST_ENABLED=false` in production
(`docs/ops/ROW133-SCREEN-DEFECTS-2026-08-31-cycle191.md:111`), and the page itself states
plainly that exemptions aren't applied yet. The write path itself is safely gated
(owner-only, and it never touches any client's contacts/sequences/sends — see the
artefact's answer above). Raised as row 158, framed as hardening to complete before the
flag is ever flipped on, not an active incident.

### 6. Support has no reply/comment thread at all, despite the page's own copy promising a closed loop

**Screen:** `/support` and `/support/[ticketId]`.

The page tells a reporter "the developer picks up each ticket, fixes it, and closes it"
(`src/app/(app)/support/page.tsx:64-66`), but the only two free-text fields a ticket ever
has are the reporter's initial description and the resolver's single closing note — no
`addComment`/reply action exists anywhere in `actions.ts`, and the detail page has no
thread UI. If the developer needs to ask a clarifying question before fixing something, it
falls outside the tool entirely. Lower urgency than finding 3 (which is a live validation
gap on an existing flow) because this is a missing feature rather than a broken one.
Raised as row 159.

## Findings noted but not raised as their own row (low severity, or already tracked)

- **Reporting**: the "Opens" tracked flag is hardcoded `true` so the "Not tracked" UI
  branch is dead code (`src/server/queries/outreach-metrics.ts:429-431`); "Not reached"
  and a few other derived metrics aren't drillable with no on-screen reason why
  (`report-detail-metrics.ts:6-10`); the aggregate "Delivered" tile at the all-clients
  scope can look artificially low once mixed with untracked clients
  (`outreach-metrics.ts:73,127-129`). All minor — the per-client detail table already
  carries the accurate numbers, and none of these change what a careful operator would
  conclude, just what a glance shows. Not raised.
- **Dashboard**: `/dashboard` is a deliberate, well-tested thin redirect to `/reporting`
  (`dashboard/page.tsx:9-11`, locked in by `dashboard-redirect.test.ts`). No finding.
- **Operations**: `admin-gate.test.ts` proves less than its title claims (a whole-file
  string search, not a per-function boundary check, and it never exercises
  `form-actions.ts`, the code the buttons actually call) — a test-quality gap, not a live
  security hole, since the real guards are genuinely present in `actions.ts`. Worth
  tightening whenever row 157 is worked, not its own row.
- **Settings — branding**: editable by any signed-in staff (not owner-gated) and applies
  instantly app-wide including the sign-in page, with no confirmation step — but this is a
  deliberate, commented design choice ("Branding is a shared feature"), and the blast
  radius is one settings row plus an audit log. Noted, not raised.
- **Settings — staff-access, ai-spend, deleted-workspaces**: all working as labeled, no
  blank stats, no finding.
- **Settings — internal-seed's `note` field**: the add-form silently drops a `note` value
  the server action reads but no input renders (`internal-seed/actions.ts:24` vs
  `internal-seed/page.tsx:97-126`). Cosmetic dead code, not worth its own row — mention if
  row 158 touches this file anyway.
- **Training**: two new findings not already covered by row 148's twelve — `staff-handover`
  is a navigation dead end nobody links to, and the printed checklist references a sidebar
  label ("People blocked from outreach") that doesn't exist (the real label is "Blocked
  contacts"). Folded into row 148 as findings (13) and (14) rather than opened as a new
  row, since row 148 already owns "training content drift" end to end and is still `TODO`.
  Also noted: training has no completion/progress tracking of any kind, and one orphaned
  image asset — both too minor to act on alone.

## Rows raised by this walk

154, 155, 156, 157, 158, 159 — see `.bidlow/relay/QUEUE.md`. Row 148 amended in place with
two additional confirmed findings rather than duplicated.

## Gates

No application code changed by this row — docs and queue-file edits only. `npm run lint`,
`npm run typecheck` and `npm test` were re-run anyway to confirm the baseline is
unaffected: lint 0, typecheck 0, full suite green (see cycle log for the exact run).
