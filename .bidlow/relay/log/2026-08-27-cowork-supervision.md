# Cowork supervision note - 2026-08-27, 15:32 UTC

## Relay health

Healthy. `STATUS.json` says cycle 50, `finished`, updated 16:21:08 +01:00
(15:21 UTC) - three minutes before this check. No `HALT` file. `relay-watch.ps1`
has a real per-cycle timeout (`$CycleTimeoutMinutes = 45`, enforced at line
1439), so the stuck-cycle failure mode is covered. Nothing needs restarting.

## What cycle 50 actually achieved - verified against git, not its log

Real work, genuinely on disk:

* `vi.setConfig({ testTimeout: 30_000 })` at `relay/queue-parser.test.ts:63`
  and `relay/gate-switch.test.ts:54`.
* `relay/powershell-timeout-budget.test.ts` exists (the non-vacuous detector).
* All committed as `7fc8b72` on `fix/relay-powershell-test-timeouts`, pushed.

And then it stopped short:

* **PR #298 was never merged.** `origin/main` is still `be2dc01` (#296) and
  contains none of the fix. The log's closing line was "I'll merge #298 once CI
  is green"; the cycle exited 0 without doing it. This is the open-PR rot the
  standing rules explicitly warn about.
* **Row 35 was left `IN PROGRESS 50`** rather than being closed or honestly
  annotated.
* **The e2e finding was never queued.** Cycle 50 reported a hard 429 failure in
  `e2e/screen-walk.spec.ts` on `/dashboard` and client-onboarding, failing all
  three retries, and said it would write it as a row. It did not, so the finding
  existed in exactly one log file.
* **One factual error in that report:** it named `main` HEAD as `a63c2f4`
  (PR #297). `a63c2f4` is a real commit but is not on `main`; `origin/main` is
  `be2dc01`. So the 429 may have been observed against a different ref, and the
  report cannot be taken at face value.

The relay then wrote `SELF-QUEUE-NOTE.md` saying the queue was exhausted and
idled. That was true of the file as written, but only because the two rows cycle
50 owed it were never written.

## What I changed

* Row 35 status corrected to the truth: code real and pushed, not merged, CI
  verdict unknown from Cowork (no `gh` and no GitHub credential reachable
  through the device bridge), not DONE until `main` carries it with a hash.
* Row 36 added for the 429 e2e failure, marked `TODO` and explicitly flagged as
  an assumed cause requiring measurement before any change.
* `NEXT.md` written: land #298 first (that is the whole of row 35), then measure
  row 36 without fixing it.

## Anything needing Greg

No. Nothing here hits the three stop-and-ask conditions - no destructive
migration, no client data, no email send. The merge is the relay's to do.

One standing limitation worth recording: Cowork cannot read GitHub PR or CI
state. `gh` is not on the device-bash path and no git credential helper answers
there, and device-bash has no network beyond git's own transport. So CI verdicts
can only be verified by the Claude Code side. Cowork can verify commits,
branches and files, and did.
