# Cycle 78 - queue row 37. The PR was merged a day before I was asked to merge it.

## The short version

Row 37 asked me to rebase and merge PR #297. **PR #297 was already merged on
2026-08-28 at 07:24:05Z**, roughly 24 hours before this cycle started. The branch
is deleted. There was nothing to do.

The brief I was given said it "HAS BEEN OPEN SINCE CYCLE 49 AND IS ROTTING". That
was not true when it was handed to me. The brief itself told me what to do about
that - "If it is wrong, say so in your log rather than working around it, and
correct QUEUE.md" - so that is what this cycle is: a verification, and two rows
closed on evidence.

No code was changed. No schema, no migration, nothing that sends. The only files
touched are `.bidlow/relay/QUEUE.md` and these logs.

## The PR sweep, which came first

`gh pr list --state open --limit 100` returned `[]`. Zero open pull requests,
drafts included. Nothing to merge, nothing red to explain, nothing to leave a
comment on.

That is worth pausing on, because the sweep exists precisely because seventeen
were open on 2026-08-28.

## What I actually verified

I could have stopped at "it says MERGED". I did not, because the row carried one
constraint that could have been violated silently, and a merged PR is exactly
where you would never look for it.

**1. The content is genuinely on `main`.**
`git merge-base --is-ancestor 6a7b3e7 origin/main` returns true. The cycle-49
record is live at `.bidlow/STATE.md:531`.

**2. `a63c2f4` is still not on `main`, and that is correct.**
Row 36 flagged this hash as missing and treated it as a discrepancy. It is a
squash merge - the content landed as `6a7b3e7`, a new hash. The original commit
object still exists locally but will never be an ancestor of `main`. Absence of
`a63c2f4` is not absence of the work, and anyone re-reading row 36 should know
that before chasing it again.

**3. The docs content was NOT edited to make CI pass.**
This was the row's one hard constraint. I extracted the added lines from the
original `a63c2f4` and from the merged `6a7b3e7` and diffed them:

    orig lines: 78  merged lines: 78
    === differences (empty means identical) ===
    IDENTICAL - docs content unchanged by the rebase/merge

**4. The three commits are explained.**
The row described "one commit". At merge the PR had three: `0150c24` (the real
docs commit) plus `6981463` and `9233db7`, both `Merge branch 'main' into
docs/state-cycle-49` - branch-protection "update branch" merges. Two of the three
are not in my local clone at all (branch deleted, then pruned), so I read them
from the GitHub API rather than guessing. Benign.

**5. CI was actually green, both jobs.**
Run [33150705639](https://github.com/gregvisser/ODoutreach/actions/runs/33150705639):
`verify` **pass 3m52s**, `E2E (Playwright)` **pass 5m40s**. Read, not inferred.

A side effect worth recording: this is the docs-only PR that row 39 said was
blocked by the J5 pacing clock dependency. Its E2E job passing is independent
confirmation that row 39's fix (`f3ef2ac`) works on the exact PR it was blocking.

## Row 68, and proving the fix fires

The brief's standing instruction says to assume the seventh "built, wired,
reporting success, never fired" defect exists. Row 68 is the obvious place to
apply that, because it claims a structural fix and its evidence is a promise
about the future ("takes effect on the next relay restart").

So I checked it from both ends rather than trusting it:

- The sweep text lives at `relay-watch.ps1:1288`, with the `gh pr list` instruction
  at 1293.
- The file is committed on `origin/main` at `3d7fef6`, and the on-disk copy has no
  diff against it - durable, not a working-tree artefact.
- **Cycle 78's own brief contained that exact section.** That is the arrival-side
  proof. It did not merely exist; it reached an agent and was executed.

Built, wired, and observed firing. Not the seventh instance.

I then measured the seventeen PRs row 68 names, one `gh pr view` each, this cycle,
rather than trusting a count taken earlier:

- **7 MERGED:** #297, #300, #291, #274, #268, #301, #302
- **10 CLOSED:** #211, #212, #243, #256, #260, #262, #264, #269, #292, #208

Both rows are now `DONE 78`.

## The one thing I am deliberately not claiming

**Ten of the seventeen were CLOSED, not merged.** A closed PR is one whose work
did not land.

For a superseded or hopelessly-conflicting branch that is the right outcome, and I
am not calling it a defect. But "the backlog is clear" and "the work all shipped"
are different sentences, and only the first is proven. I did not open ten closed
PRs to audit whether any carried work still wanted - that is a cycle of its own,
not a footnote to this one. If it matters, it needs its own row. Nothing here
establishes it either way, and I would rather say that than round it up.

## Gates

Nothing was built, so most gates have nothing to bite on. What I ran is what
actually guards the files I changed - the relay's own tests over `QUEUE.md`
parsing, queue file integrity, and the cycle-log-reaches-git rule. Output is in
the commit and in the session transcript.

I did not run `npm run build`. No application source was touched, so it would
prove nothing about this change, and claiming a gate I ran for appearance's sake
is the thing this project is supposed to be least willing to do.

## Corrections made to the record

1. Row 37: `IN PROGRESS 78` -> `DONE 78`, with the staleness stated plainly rather
   than quietly closed.
2. Row 68: `TODO` -> `DONE 78`. Left as TODO, the next cycle would have picked it,
   run the same sweep, found zero PRs, and spent a cycle rediscovering this.
3. Recorded that `a63c2f4` will never be on `main`, so row 36's dangling hash does
   not get re-investigated a third time.
