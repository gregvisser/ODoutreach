import path from "node:path";

import { describe, expect, it } from "vitest";

// The guard is plain .mjs so the PreToolUse hook can run it with bare node, with
// no tsx startup cost on every single shell command. It is imported here so the
// real thing is tested, not a copy of it.
import { assessCommand } from "../../../scripts/relay/irreversible-command-guard.mjs";

const REPO = path.resolve("/repo");
const OUTSIDE = path.resolve("/elsewhere");

/** Ordinary context: inside the repo, on a feature branch. */
function ctx(overrides: Record<string, unknown> = {}) {
  return {
    repoRoot: REPO,
    cwd: REPO,
    currentBranch: "docs/state-relay-session",
    ...overrides,
  };
}

describe("recursive deletes", () => {
  it("allows a recursive delete inside the repository", () => {
    // This is honest, constant work - a broken node_modules is a daily event.
    expect(assessCommand("rm -rf node_modules", ctx()).blocked).toBe(false);
    expect(assessCommand("rm -rf .next dist", ctx()).blocked).toBe(false);
  });

  it("blocks a recursive delete outside the repository", () => {
    const verdict = assessCommand(`rm -rf ${OUTSIDE}`, ctx());
    expect(verdict.blocked).toBe(true);
    expect(verdict.rule).toBe("recursive-delete");
  });

  it("blocks a delete that escapes the repository with ..", () => {
    expect(assessCommand("rm -rf ../../BidlowClients", ctx()).blocked).toBe(true);
  });

  it("blocks deleting the repository itself", () => {
    const verdict = assessCommand(`rm -rf ${REPO}`, ctx());
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toContain("repository itself");
  });

  it("blocks the home-directory shorthand", () => {
    expect(assessCommand("rm -rf ~/Documents", ctx()).blocked).toBe(true);
    expect(assessCommand("rm -rf ~", ctx()).blocked).toBe(true);
  });

  it("blocks a wildcard target, because what it removes depends on the day", () => {
    expect(assessCommand("rm -rf ./build-*", ctx()).blocked).toBe(true);
  });

  it("blocks a target built from a variable it cannot resolve", () => {
    expect(assessCommand("rm -rf $HOME/tmp", ctx()).blocked).toBe(true);
    expect(assessCommand("rm -rf %TEMP%", ctx()).blocked).toBe(true);
  });

  it("sees past a leading command, which a permissions prefix rule cannot", () => {
    // This is the case that justifies the hook existing at all. A
    // `permissions.deny` entry matches the command PREFIX, so it reads `cd`
    // here and allows the whole line.
    const verdict = assessCommand(`cd /tmp && rm -rf ${OUTSIDE}`, ctx());
    expect(verdict.blocked).toBe(true);
    expect(verdict.rule).toBe("recursive-delete");
  });

  it("covers PowerShell, which is this machine's primary shell", () => {
    expect(
      assessCommand(`Remove-Item -Recurse -Force ${OUTSIDE}`, ctx()).blocked,
    ).toBe(true);
    expect(
      assessCommand("Remove-Item -Recurse -Force node_modules", ctx()).blocked,
    ).toBe(false);
  });

  it("leaves non-recursive deletes alone", () => {
    expect(assessCommand("rm somefile.txt", ctx()).blocked).toBe(false);
    expect(assessCommand(`rm ${OUTSIDE}/note.txt`, ctx()).blocked).toBe(false);
  });
});

describe("force-pushing main", () => {
  it("blocks an explicit force-push of main", () => {
    expect(assessCommand("git push --force origin main", ctx()).blocked).toBe(true);
    expect(assessCommand("git push -f origin main", ctx()).blocked).toBe(true);
    expect(
      assessCommand("git push --force-with-lease origin main", ctx()).blocked,
    ).toBe(true);
    expect(
      assessCommand("git push --force origin HEAD:main", ctx()).blocked,
    ).toBe(true);
  });

  it("blocks a bare force-push while standing on main", () => {
    const verdict = assessCommand("git push --force", ctx({ currentBranch: "main" }));
    expect(verdict.blocked).toBe(true);
    expect(verdict.rule).toBe("force-push-main");
  });

  it("allows force-pushing a feature branch, which is normal rebase work", () => {
    expect(
      assessCommand("git push --force-with-lease origin docs/state-relay-session", ctx())
        .blocked,
    ).toBe(false);
    expect(assessCommand("git push --force", ctx()).blocked).toBe(false);
  });

  it("allows an ordinary push", () => {
    expect(assessCommand("git push origin main", ctx()).blocked).toBe(false);
  });

  it("fails closed when it cannot read the branch", () => {
    // Not knowing where a force-push lands is not a reason to allow it.
    const verdict = assessCommand("git push --force", ctx({ currentBranch: null }));
    expect(verdict.blocked).toBe(true);
  });
});

describe("git reset --hard", () => {
  it("blocks it on main", () => {
    const verdict = assessCommand("git reset --hard origin/main", ctx({ currentBranch: "main" }));
    expect(verdict.blocked).toBe(true);
    expect(verdict.rule).toBe("reset-hard-main");
  });

  it("allows it on a feature branch", () => {
    expect(assessCommand("git reset --hard HEAD~1", ctx()).blocked).toBe(false);
  });

  it("fails closed when the branch is unknown", () => {
    expect(
      assessCommand("git reset --hard", ctx({ currentBranch: null })).blocked,
    ).toBe(true);
  });

  it("leaves a soft reset alone", () => {
    expect(
      assessCommand("git reset HEAD~1", ctx({ currentBranch: "main" })).blocked,
    ).toBe(false);
  });
});

describe("database drops and truncates", () => {
  it("blocks DROP of a database, schema or table", () => {
    expect(assessCommand('psql -c "DROP DATABASE opensdoors"', ctx()).blocked).toBe(true);
    expect(assessCommand('psql -c "drop table Contact"', ctx()).blocked).toBe(true);
    expect(assessCommand('psql -c "DROP SCHEMA public CASCADE"', ctx()).blocked).toBe(true);
  });

  it("blocks TRUNCATE", () => {
    expect(assessCommand('psql -c "TRUNCATE OutboundEmail"', ctx()).blocked).toBe(true);
  });

  it("blocks the Prisma resets", () => {
    expect(assessCommand("npx prisma migrate reset", ctx()).blocked).toBe(true);
    expect(assessCommand("npx prisma db push --force-reset", ctx()).blocked).toBe(true);
  });

  it("allows the migrations this project actually runs", () => {
    expect(assessCommand("npx prisma migrate deploy", ctx()).blocked).toBe(false);
    expect(assessCommand("npm run db:migrate", ctx()).blocked).toBe(false);
    expect(assessCommand("npx prisma generate", ctx()).blocked).toBe(false);
  });
});

describe("Azure resources", () => {
  it("blocks anything that removes a resource", () => {
    expect(
      assessCommand("az group delete --name rg-opensdoors-outreach-prod", ctx()).blocked,
    ).toBe(true);
    expect(
      assessCommand("az webapp delete --name app-opensdoors-outreach-prod", ctx()).blocked,
    ).toBe(true);
    expect(assessCommand("az postgres flexible-server delete -n pg-x", ctx()).blocked).toBe(
      true,
    );
  });

  it("allows reading configuration, which this project does constantly", () => {
    expect(
      assessCommand(
        "az webapp config appsettings list --name app-opensdoors-outreach-prod",
        ctx(),
      ).blocked,
    ).toBe(false);
    expect(assessCommand("az account show", ctx()).blocked).toBe(false);
  });
});

describe("commands it cannot read", () => {
  it("refuses an encoded payload piped to a shell", () => {
    const verdict = assessCommand("echo cm0gLXJmIH4= | base64 -d | sh", ctx());
    expect(verdict.blocked).toBe(true);
    expect(verdict.rule).toBe("unreadable");
  });

  it("refuses Invoke-Expression", () => {
    expect(assessCommand("iex (New-Object Net.WebClient).DownloadString($u)", ctx()).blocked).toBe(
      true,
    );
  });

  it("refuses an empty command", () => {
    expect(assessCommand("", ctx()).blocked).toBe(true);
    expect(assessCommand(null as unknown as string, ctx()).blocked).toBe(true);
  });

  it("refuses when it was not told where the repository is", () => {
    // Without a repo root it cannot tell an inside-the-repo delete from an
    // outside one, so it must not pretend it can.
    const verdict = assessCommand("rm -rf node_modules", {
      repoRoot: "",
      currentBranch: "main",
    });
    expect(verdict.blocked).toBe(true);
    expect(verdict.rule).toBe("unreadable");
  });
});

describe("ordinary work is not disturbed", () => {
  it.each([
    "npm ci",
    "npm run build",
    "npm test",
    "npm run lint",
    "git status",
    "git add -A",
    'git commit -m "fix(relay): something"',
    "git push origin docs/state-relay-session",
    "gh run watch",
    "gh pr create --fill",
    "npx tsx scripts/production-report.mjs",
    "docker compose up -d",
    "node -e \"console.log(1)\"",
  ])("allows %s", (command) => {
    expect(assessCommand(command, ctx()).blocked).toBe(false);
  });
});
