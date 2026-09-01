# Row 145 — the field-knowledge gate on CHECK

**2026-09-01, cycle 224.** Greg approved this on 31 August: "do the gate, but ensure ODoutreach
does not break." This is that gate, and this is the proof it does not break ODoutreach.

## The defect

`_standards/checklists/email-sending.md` records, in Greg's own words, that his field knowledge
of cold email sending was **1 out of 5 at ODoutreach kickoff and was treated as 4**, and names
that gap as the root cause of the incident that damaged a client's sending domain. The score
already existed. Nothing read it. That is the whole defect: a number written down to prevent a
repeat, which no gate consulted.

## The change

Three files, and only these three, all under `C:\Bidlowprojects\_standards\bidlow-standards\plugins\bidlow-standards\scripts\`
— the only paths this row authorised:

- **`lib.mjs`** — new pure functions: `listChecklistFields`, `loadChecklistText`,
  `checklistFieldKnowledgeScore` (reads the governing score out of a checklist's own
  `**Field knowledge score (0-5):**` line — the lowest number in that line, per
  `ecommerce-payments.md`'s own stated rule "the lower score is the one that governs"),
  `governingChecklistFields` (resolves which checklist(s) apply to a project — an explicit
  `domain.field`, or a fallback scan of every checklist's own `**Applies to:**` line for a
  mention of the project), `fieldKnowledgeOverrideValid` (a named, dated, reasoned,
  field-specific override), and `fieldKnowledgeGateFailure` — the decision itself.
- **`gate-build.mjs`** — wires the gate into the existing PreToolUse hook on Write/Edit/
  NotebookEdit, BEFORE the `.bidlow/` exempt-path bypass (DOMAIN.json is exactly what CHECK
  writes, and `.bidlow/` is normally exempt from the rest of this gate). Fires only when a
  write would leave `.bidlow/DOMAIN.json` with `status: "researched"` — CHECK closing.
- **`session-start.mjs`** — surfaces the gate's state on every session start, on any project it
  applies to: the governing checklist, its score, and either "grandfathered" (live), the
  recorded override (who / when / why), or "CHECK CANNOT CLOSE" if neither.

`_standards/checklists/*.md` itself was **not touched** — those scores are Greg's own field
judgement, explicitly out of scope for this row, read only.

## The grandfather clause — and why ODoutreach is untouched by construction

"Every project whose CHECK is already closed is GRANDFATHERED." A project is grandfathered when
its own `.bidlow/PROJECT.json` carries `"lifecycle": "live"` — the exact test the pre-existing
DOORS policy in the same file already uses for the identical reasoning ("the doors are shut
behind them"). `fieldKnowledgeGateFailure` returns `null` (never blocks) unconditionally when
`lifecycle === 'live'`, before it even reads a score.

ODoutreach's own `.bidlow/PROJECT.json` reads `{"lifecycle":"live", ...}`. Its governing
checklist, resolved the same way this gate resolves it for any project, is `email-sending`
(matched via `email-sending.md`'s own `**Applies to:** ODoutreach, ...` line — `domain.field` is
not populated in ODoutreach's own `DOMAIN.json`, which is itself an existing, separate gap this
row did not touch), scoring 1. So the gate structurally never fires for ODoutreach: not "fires
and is overridden," but never evaluated past the lifecycle check at all.

**Proven directly against the real, running repository**, not only a synthetic fixture — see
`standards/field-knowledge-gate.test.ts`, test "leaves a grandfathered ... project untouched":
it reads ODoutreach's own live `.bidlow/DOMAIN.json` off disk, feeds its exact content back
through the real `gate-build.mjs` as the PreToolUse hook would, and asserts exit code 0.

## Fail safe, not fail shut

`fieldKnowledgeGateFailure` returns `null` (allow) whenever:
- the pending write is not to `.bidlow/DOMAIN.json`
- the resulting `status` is not `"researched"` (CHECK is not closing)
- the project is `lifecycle: "live"` (grandfathered)
- no checklist can be matched to the project at all
- the matched checklist(s) cannot be read, or carry no parseable score
- a valid, named, field-specific override is recorded in
  `DOMAIN.json.field_knowledge_override`

It only ever blocks when a score of 0 or 1 is positively read for a positively-identified
governing checklist, on a non-live project, with no valid override. An unreadable rule can never
masquerade as a passing one, and it can never masquerade as a failing one either.

## Proof it fires (red-first)

`standards/field-knowledge-gate.test.ts` (5 tests) spawns the real `gate-build.mjs` as a child
process with JSON on stdin — exactly how Claude Code's PreToolUse hook invokes it — and reads
the exit code, exactly as the harness does (0 = allow, 2 = block).

**Red-first, whole-feature.** All three files were reverted to their pre-change originals (saved
before editing) and the suite re-run:

```
✗ blocks a NEW CHECK close when the governing checklist scores 1        expected 0 to be 2
✗ lets a NAMED override through -- an unnamed one still blocks           expected 0 to be 2
✓ leaves a grandfathered project untouched                               (trivially — nothing blocks pre-change)
✓ does not block when the score cannot be determined                     (trivially)
✓ does not fire on an ordinary source-file write                         (trivially)
```

Two of the five failed red, as expected — those two assert a block exists. The remaining three
assert *absence* of a block, which is also true with zero implementation, so they cannot go red
by reverting the whole feature. Per this row's own instruction ("prove the test is capable of
failing by deliberately breaking the code and showing the red"), the grandfather test was proven
capable of failing in isolation instead: with the rest of the patch restored, the single line
`if (lifecycle === 'live') return null;` was replaced with `if (false) return null;` and only
that test re-run:

```
✗ leaves a grandfathered (lifecycle live) project untouched              expected 2 to be 0
```

It went red against the real ODoutreach `DOMAIN.json` specifically — confirming the grandfather
clause, not luck, is what keeps ODoutreach unblocked. The line was restored and the full suite
re-run green (7/7, including the pre-existing `bidlow-deck-out-of-order-headline.test.ts`).

## Gates run

- `npm run lint` — 0 errors.
- `npx tsc --noEmit` — 0 errors.
- `npm test` — **3986 passed / 389 files**, 0 failed.
- `npm run build -- --webpack` — production build succeeded (see cycle log for the captured
  output; this is the literal proof ODoutreach still builds, not only that its hooks allow the
  attempt).

## What was deliberately not done

- **Nothing under `_standards/checklists/`** was created, edited or reworded — explicitly out of
  scope, Greg's own field judgement.
- **No sibling project folder** (`Kepak`, `Papaya`, `BidlowTools/*`) was touched.
- **No scoring artefact** — no `.bidlow/GRADES.json`, no dimension, no sell gate. This row is a
  gate, not a grade.
- **`bidlow-deck.mjs` was not touched** — it is under `_standards` but was not one of the three
  authorised paths. "Visible on the deck rather than buried" is satisfied within the three
  authorised files via `session-start.mjs`, which now surfaces the gate's state (score,
  grandfather status, or recorded override) on every session for any project it applies to. A
  cross-project HTML-deck integration (`bidlow-deck.mjs`, which this row did not authorise) would
  need its own row if wanted — noted here as a finding, not actioned.
- **No real email sent, no client data touched, for anyone but `bidlowai`** — this row never
  came near a send path; it is pure tooling logic and a project's own governance files.

## Files changed

- `C:\Bidlowprojects\_standards\bidlow-standards\plugins\bidlow-standards\scripts\lib.mjs`
- `C:\Bidlowprojects\_standards\bidlow-standards\plugins\bidlow-standards\scripts\gate-build.mjs`
- `C:\Bidlowprojects\_standards\bidlow-standards\plugins\bidlow-standards\scripts\session-start.mjs`
- `standards/field-knowledge-gate.test.ts` (new, this repo)
- `docs/ops/ROW145-FIELD-KNOWLEDGE-GATE-ON-CHECK-2026-09-01-cycle224.md` (this file)
