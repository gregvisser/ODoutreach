# The deny list — built and tested, NOT installed

**Status: the guard works and is proven. The configuration that switches it on is
not in place, and I could not put it there.**

That distinction is the whole point of this file. This project has found six
separate instances of something built, wired, reporting success, and never
firing. Writing "deny list added" when the config was not installed would have
been the seventh, so it is written down as unfinished instead.

## Why I could not install it

The Write tool refuses any path under `.claude/`. That is not the Bidlow build
gate and it is not a sandbox quirk — Claude Code deliberately stops an agent
writing its own hook configuration and permission rules. A control the model can
rewrite is not a control.

The refusal is correct, and I did not route around it with a shell command. The
filesystem would have allowed that; the intent behind the refusal would not.

## What Greg does — once, about thirty seconds

Copy `proposed-claude-settings.json` (next to this file) to `.claude/settings.json`,
dropping the `_comment` line. Or from the repository root:

```powershell
node -e "const f=require('fs');const s=JSON.parse(f.readFileSync('.bidlow/relay/proposed-claude-settings.json','utf8'));delete s._comment;f.writeFileSync('.claude/settings.json',JSON.stringify(s,null,2)+'\n')"
```

Then **verify it fired**, because an installed hook that does not run is the
defect class this repository is worst at:

```powershell
npm test -- src/lib/safety/irreversible-command-guard.test.ts   # 42 tests, the logic
node scripts/relay/verify-deny-hook.mjs                          # 11 cases, the wiring
```

The second one is the one that matters. It runs the hook the way Claude Code runs
it — JSON on stdin, exit code out — and reports ALL PASS or names what failed.

## The two layers, and why both exist

| | `permissions.deny` | the PreToolUse hook |
|---|---|---|
| Matches | the command **prefix** | the **whole** command line |
| Sees `cd /tmp && rm -rf ~` | as `cd` — **allows it** | as a delete outside the repo — blocks |
| Runs in `dontAsk` mode | yes | yes, and *before* permission rules |
| Can tell `rm -rf node_modules` from `rm -rf ~` | no | yes |

The deny list carries only the absolutes — things with no legitimate use in this
repository ever, like `az group delete` or `prisma migrate reset`. It deliberately
does **not** carry `rm -rf` or `git reset --hard` in general, because both are
honest daily work (`rm -rf node_modules`, a reset on a feature branch) and a rule
that breaks real work every day gets loosened until it protects nothing.

The context-dependent judgements live in the hook, where there is enough
information to make them: is this delete inside the repo, does this force-push
land on `main`.

## What is covered

* recursive deletes — allowed inside the repo, refused anywhere else, refused
  when the target is a wildcard, a variable, or `~`
* `git push --force` / `-f` / `--force-with-lease` onto `main`
* `git reset --hard` while standing on `main`
* `DROP DATABASE` / `DROP SCHEMA` / `DROP TABLE` / `TRUNCATE`,
  `prisma migrate reset`, `prisma db push --force-reset`
* `az … delete` / `purge` / `remove`
* commands it cannot read at all — an encoded payload piped to a shell — are
  refused rather than guessed at

## What is NOT covered — say this plainly

**This is a mistake guard, not a security boundary.** It matches text, and text
matching over a shell is a denylist against an unbounded surface. It stops a
wrong turn on an unattended 3am cycle. It would not stop something trying to get
past it.

Specifically not covered, on purpose:

* `git clean -fdx` and `git checkout -- .` destroy uncommitted work. Left out
  because both are common honest recovery moves and the loss is limited to
  changes never committed.
* `DELETE FROM` without a `WHERE`. Left out because the phrase appears in
  ordinary source and migration text often enough that blocking it would cost
  more cycles than it saves.
* Anything reached through a program this guard does not know the name of.

Adding these later is cheap. Claiming they are covered when they are not is the
expensive thing.
