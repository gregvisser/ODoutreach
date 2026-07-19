<!-- BidlowAI PR template — the merge gate. A PR that can't tick these does not merge. -->

## What & why
<!-- One paragraph: what this changes and why. Link the issue. -->

## Definition of Done (BidlowAI Engineering Standard)
- [ ] Spec written before coding; change scoped to one concern
- [ ] `lint` passes
- [ ] `typecheck` passes (strict; no `any` / `# type: ignore` added)
- [ ] `tests` pass, and I added/updated tests for this change
- [ ] New user-facing flow has an e2e test (or n/a — say why)
- [ ] New inputs validated at the boundary (zod/pydantic)
- [ ] Errors handled and reported to monitoring; nothing swallowed
- [ ] No secrets, binaries/media, or other-client assets; `.env.example` updated if needed
- [ ] No stray `console.log`/`print`, commented-out code, or untracked `TODO`
- [ ] CI is green

## Risk & rollback
<!-- What could break, and which commit to revert to. -->

## Screenshots / evidence
