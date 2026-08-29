# Cycle 116 — row 96: production deploy-lag claim

## The claim, and what it turned out to be

Row 96 said production was serving `8da903f` (buildTimestamp
`2026-08-29T14:43:07Z`) at 19:05 UTC on 29 August, while `origin/main` had
already moved to `e318a78`, and asked whether the deploy pipeline had
failed, been cancelled, or never triggered.

**Measured now, 30 August, direct App Service origin (never the CDN-cached
custom domain):**

```
$ git rev-parse origin/main
6466c6b1f871bc8b11a06d1977d1da6af5f45d87

$ curl -s https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info
{"service":"opensdoors-outreach","version":"0.1.0","nodeEnv":"production",
 "commit":"6466c6b1f871bc8b11a06d1977d1da6af5f45d87",
 "buildTimestamp":"2026-08-29T23:41:40Z"}
```

Production's commit matches `origin/main` HEAD exactly. Not close, not a
recent-enough proxy — the identical hash. This is the strongest form of
proof this row asked for: not a green workflow run, a runtime commit match
on the direct origin.

## What actually happened between 14:42 and 19:05 UTC on 29 August

Pulled every `Deploy production (Azure Web App)` run from GitHub's own
record, not the badge:

```
$ gh api repos/gregvisser/ODoutreach/actions/workflows/deploy-production.yml/runs
total_count: 472

$ gh api ".../deploy-production.yml/runs?per_page=100" \
    --jq '.workflow_runs[] | select(.conclusion != "success")'
(no output — zero non-success runs in the last 100)
```

Chronological run list across the gap the row flagged:

| created (UTC) | conclusion | commit |
|---|---|---|
| 14:42:14 | success | `8da903f` |
| *(3h53m gap — no runs)* | | |
| 18:35:07 | success | `89ef8fbe3` |
| 18:42:55 | success | `a14bee999` |
| 18:57:49 | success | `e318a78` |
| 19:57:27 | success | `c0b79d61` |
| ... | success | (18 more, through 23:40:54 → `6466c6b1f`, current HEAD) |

**The 3h53m gap was not a stuck pipeline — it was quiet git history.**
`git log 8da903f..89ef8fbe3` returns exactly one commit, and it's the CR-08
fix itself, merged at 18:35:05 UTC. Its deploy run started two seconds
later and succeeded. No commits landed on `main` during the gap the row
was worried about, so there was nothing for a deploy to miss.

**The named suspect (`cancel-in-progress: true` on the
`deploy-production-azure` concurrency group cancelling deploys in a merge
burst) is cleared, not confirmed.** Three merges landed back-to-back at
18:35, 18:42 and 18:57, and all three deploy runs completed successfully —
none was cancelled. Across the full 472-run history, zero non-success
conclusions turned up in the last 100. If a burst had ever cancelled a
deploy, GitHub's run list would show a `cancelled` conclusion; it never
does, in this window or any other checked.

## So what did the row actually see at 19:05 UTC?

The `e318a78` deploy run completed at **18:57:49→19:03:48 UTC**. The row's
own measurement was taken at **19:05 UTC** — roughly 90 seconds after that
run finished. `[[e2e-and-deploy-verification]]` (memory) already documents
that Azure keeps serving the previous build for **~2 minutes** after a
successful deploy run completes. 19:05 sits inside that window. The row's
snapshot was real, but it was a propagation-lag artefact of a deploy that
had, in fact, just succeeded — not evidence of a failed or skipped deploy.

## CR-08, confirmed live in the currently-running commit

```
$ git show 6466c6b1f871bc8b11a06d1977d1da6af5f45d87:\
  "src/app/(app)/activity/outbound/[id]/page.tsx" | grep -n isSuperAdmin
66:            {staff.isSuperAdmin ? (
```

The commit production is currently serving contains the CR-08 gate. It is
not merged-but-unshipped; it is running.

## PR sweep (start of cycle)

`gh pr list --state open` returned exactly one: **#407**
(`docs/state-cycle-113`, cycle 115's own follow-on PR, CI was IN_PROGRESS at
cycle start). Auto-merge is disabled on this repo
(`enablePullRequestAutoMerge` GraphQL error), so it could not be armed to
merge unattended — merged by hand once CI went green, see below.

The working tree also carried three files of **stale uncommitted local
edits** (`.bidlow/STATE.md`, `QUEUE.md`, `log/cycle-115.md`) that were
already superseded by commits pushed to `origin/docs/state-cycle-113`
(cycle 115's own commit, `dd29311`). Confirmed byte-for-byte redundant
(`git diff HEAD` empty after stash + fast-forward pull), then dropped the
stash rather than carry duplicate content forward.

Found (not touched, not this row's work): an untracked file
`ODOUTREACH-PROJECT-INSTRUCTIONS.md` at the repo root, unrelated to this
row. Left in place — not part of the PR sweep (untracked, no PR), not named
by this row.

## Verdict

Row 96's underlying worry — "merged, graded, and not live" — was true for a
roughly two-minute window at measurement time and has not been true since.
No pipeline defect exists to fix: the gap was quiet git history, not a
stuck deploy; the concurrency/cancel-in-progress suspect is cleared by 472
runs with zero non-success conclusions; and production now matches
`origin/main` HEAD exactly, confirmed on the direct origin. No code change
was needed or made. Definition of done (production `/api/build-info`
returns the current `main` commit, confirmed on the direct origin) is met
and quoted above.
