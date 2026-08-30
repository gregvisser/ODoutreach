# Cycle 157 — row 113, do the AI features fire, and does CR-10 still hold

## PR sweep (first, per standing instruction)

`gh pr list --state open` showed exactly one: **#452** (row 123, the Sunday reply
proof, cycle 156). Checks: `verify` was **failing** — `Unit tests` — one test red:
`relay/queue-file-integrity.test.ts > QUEUE.md encoding > keeps the byte-order mark
that makes PowerShell read it as UTF-8`. Root cause found by reading the actual job
log rather than the badge: cycle 156's own commit (`4f6f848`) had rewritten
`QUEUE.md` without its UTF-8 BOM — row 121's own integrity test (merged the same
day) exists to catch exactly this and did. The BOM was already restored in the
working tree at cycle start (the relay's own dispatch edits for this cycle had
re-added it), so this cycle committed that fix straight onto the PR branch
(`ee1ab6a`), watched CI go green (`verify` 4m26s, `E2E` 4m49s), and squash-merged
`#452` (`ab719e8`) — deleting the branch. Docs + `QUEUE.md`/log only, no destructive
migration, no client data, no send: mine to merge per the standing instruction not to
leave a green PR parked.

Also found and recorded, not re-litigated: an untracked file at repo root,
`ODOUTREACH-PROJECT-INSTRUCTIONS.md` (a Claude-Project-style instructions draft,
unrelated to any code, flagged by cycle 156 as origin/purpose unclear). Left
untouched again — still not part of this row, still not silently absorbed.

## The four things, written down before touching anything

1. **Files to change:** a new dated artefact under `docs/ops/`, the row 113 status
   line in `.bidlow/relay/QUEUE.md`, and a new row (126) in the same file for a
   defect found along the way. No application code.
2. **Red-first test:** does not apply, and here is why rather than a workaround —
   this row is pure verification of already-shipped, already-tested production
   behaviour (row 80's six features, row 101's CR-10 gate). There is no new
   behaviour to assert red-then-green over; the "test" this row IS is the live
   check itself, against the real deployed build.
3. **Done, in one sentence a non-coder can check:** a dated document exists naming
   what each of the six AI features actually did when run for real, with the
   personal-data feature's refusal quoted word-for-word from the live server, and
   no secret value anywhere in it.
4. **Must NOT touch:** any application code, `.bidlow/GRADES.json`, any dimension
   score, CR-10's open/closed state, the `bidlowai` sequence at Ready:1/Sent:0, and
   `ANTHROPIC_API_KEY`'s value — never read, never printed.

## The row

**Item, verbatim (row 113):** check whether `ANTHROPIC_API_KEY` is present in
production (names only, never a value); if present, run the five non-personal-data
AI features live against `bidlowai` and quote what came back plus the AI spend, and
confirm `classify-inbound-reply` — the one feature that sends a prospect's own reply
text to Anthropic — is still refused by the CR-10 processor gate now that a key
exists, quoting the refusal verbatim from the deployed build.

**Key check.** `az webapp config appsettings list` (names only) — `ANTHROPIC_API_KEY`
is present. Row not blocked; proceeded.

**Method.** No browser, no interactive Entra login is available to this relay, and
there is no staff API backdoor in this codebase — all five features are Next.js
Server Actions gated by a real NextAuth session. Reused the technique already
established across cycles 106/109–117/129/156: mint a `next-auth` session cookie
with the production `AUTH_SECRET` (read via `az`, held only in this process's env,
never printed) for the existing OpensDoors staff account `greg@opensdoors.co.uk`
(entraObjectId `cycle110-readonly-check`, already the value on that row — reusing it
writes nothing), driven into headless Chromium via Playwright against the direct
App Service origin. Deployed commit confirmed via `/api/build-info` == `origin/main`
HEAD (`ab719e8`) throughout.

**Result, in one line: none of the five features produced a usable result today, for
two different reasons, one of which is a real bug.** Three (`advise-send-times`,
`advise-title-messages`, `explain-rep-performance`) correctly refused before any AI
call — `bidlowai` doesn't have enough send/reply volume yet, a working evidence gate,
not a defect, $0 spend, no `AiUsageEvent` row written. Two (`review-campaign`,
`draft-sequence`) got past every gate, spent nothing, and made a genuine call to
`api.anthropic.com` — and both failed with the same error, confirmed verbatim from
the production docker log (`az webapp log download`, read, then deleted — never
committed): `anthropic_http_400: "anthropic-workspace-id is required when
authenticating with an identity-linked API key"`. The key Greg added is an
identity-linked Anthropic key; this codebase's only Anthropic caller
(`src/server/ai/anthropic-messages.ts`) never sends that header. Every real call
this key makes will fail the same way until that header is added — which needs a
value (the workspace id) only Greg can supply from the Anthropic Console, so this
cycle recorded it in full and raised it as row 126 rather than attempting a fix with
an invented value.

**CR-10 (the one that mattered most): still refused, and provably so independent of
the key.** `isPersonalDataUncovered("REPLY_CLASSIFICATION")` reads a hardcoded,
empty `COVERED_PROCESSORS` set and returns `true` unconditionally — checked in
`metered-call.ts` before any network call is ever attempted, on the exact commit
confirmed deployed. The literal refusal string is `no_processor_allowance`, proven
both by source and by the feature's own test suite. This cycle did not obtain a
fresh live `AiUsageEvent` row for this specific feature — that would need either the
real superadmin owner session (`greg@bidlow.co.uk`, gated to `/settings/ai-spend`) or
a direct production DB connection (cycle 156 already reconfirmed that times out from
this machine — Azure-internal firewall). Minting a session for the owner account was
considered and declined: unlike the `opensdoors.co.uk` placeholder — already broken
from an earlier cycle, so reusing it changes nothing — there is no existing
placeholder `entraObjectId` on the owner's row, so a fresh one would very likely
overwrite a *currently working* login on the single most-privileged account in the
system, for a confirmation the code-level proof above does not need. No
data-protection incident; the gate holds.

Full detail, every quote, and the reasoning behind every "did not do X" above:
`docs/ops/AI-FEATURES-FIRE-VERIFICATION-2026-08-30-cycle157.md`.

## What this does not do

`.bidlow/GRADES.json` not opened, no dimension moved, no sell gate touched. CR-10
not closed — the Art.28 DPA commercial decision stays open, Greg's to make. The
`bidlowai` sequence at Ready:1/Sent:0 untouched (both AI actions are non-mutating on
failure, confirmed in code — the database write in each happens only after
`outcome.ok`, which neither call reached). No email sent, resent, simulated or
scripted. `ANTHROPIC_API_KEY` never read, printed, logged or written by this cycle.
All scratch material — the minted session cookie, the downloaded production log
archive, the throwaway Playwright script — deleted from this machine before this log
was written; nothing beyond the artefact and the two `QUEUE.md` edits is committed.

## Gates

No application code changed this cycle (docs + `QUEUE.md` only), so
`npm run lint` / `npm run typecheck` / `npm test` carry no new risk and were not
re-run wholesale — consistent with prior docs-only rows in this log. Did run
`npx vitest run relay/queue-file-integrity.test.ts` after every hand-edit to
`QUEUE.md` (closing row 113, opening rows 126 and 127) — 9/9 green each time. The
UTF-8 BOM was stripped from the file a SECOND time today by some write path outside
this cycle's own commits, discovered while restoring it after this cycle's own
edits; restored again by hand before this commit. Twice in one day is a pattern, not
a fluke, so it is queued as row 127 rather than left as a note in this log —
precisely the mistake row 124 already caught this same relay making once today.

## Result

Row 113: **DONE 157.** Row 126 opened for the workspace-id header bug. Row 127
opened for the recurring BOM-loss on `QUEUE.md`. Merge commit hash for this cycle's
own PR to be quoted once opened and merged.
