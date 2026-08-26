/**
 * Decide whether a shell command does something that cannot be undone.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The relay runs unattended cycles. An agent working alone at 3am can make a
 * wrong turn, and most wrong turns are cheap - a bad commit is revertable, a
 * failed build is a red CI run. A handful are not. Deleting the client's
 * production database, force-pushing over `main`, or removing the Azure app
 * are all one command away and none of them have an undo.
 *
 * So this is a DENY list, not an allow list. An allow list of command prefixes
 * would break honest work constantly - npm, git, az, tsx, prisma, gh - and
 * every break costs a cycle, which pushes toward loosening it again until it
 * protects nothing. Deny is wide enough to work and closed on the few things
 * that end a client relationship.
 *
 * WHAT THIS IS NOT
 * ----------------
 * **This is a mistake guard, not a security boundary.** It matches text, and
 * text matching over a shell is a denylist against an unbounded surface. A
 * process that WANTS to get past it can. `gate-ship.mjs` in the standards
 * plugin already records this lesson in its own words: an adversarial pass
 * walked through its earlier regexes four different ways in ten minutes.
 *
 * It is here so an honest wrong turn cannot be catastrophic. Claiming more
 * than that would be the same defect this project has now found six times:
 * a control that reports protection it does not provide.
 *
 * Two things do raise the bar above a plain prefix match, and both matter:
 *   - it reads the WHOLE command line, including after `&&`, `;` and `|`, so
 *     `cd /tmp && rm -rf ~` is seen. Prefix rules only ever see `cd`.
 *   - it refuses commands it cannot read (encoded payloads piped to a shell)
 *     rather than passing them. A check that did not run is never a pass.
 */

import path from "node:path";

/** Longhand and clustered short flags that make a delete recursive. */
const RECURSIVE_FLAG = /^(-{1,2}[rR]$|--recursive$|-[a-zA-Z]*[rR][a-zA-Z]*$)/;

/** Commands that remove a directory tree, across the three shells in play. */
const DELETE_COMMANDS = new Set([
  "rm",
  "remove-item",
  "ri",
  "rd",
  "rmdir",
  "del",
  "erase",
]);

/** `az <group> delete` and friends. Any Azure verb that removes something. */
const AZURE_DESTRUCTIVE_VERBS = new Set(["delete", "purge", "remove"]);

/**
 * Ways to hand a shell something this guard cannot read. Nothing in this
 * repository needs any of them, and each one defeats every rule below, so
 * they are refused outright rather than guessed at.
 */
const OPAQUE_PATTERNS = [
  /base64\s+(-{1,2}d|--decode)/i,
  /frombase64string/i,
  /\biex\b/i,
  /invoke-expression/i,
  /\|\s*(ba)?sh\b/i,
  /\bcurl\b[^|]*\|\s*\w*sh\b/i,
];

/** Split a command line into the pieces that run as separate programs. */
function segments(command) {
  return command
    .split(/&&|\|\||[;\n|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Quote-aware split. Good enough for flags and paths; not a shell parser. */
function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote = null;

  for (const char of segment) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Compare two resolved paths the way the host filesystem would. */
function samePath(a, b) {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** Is `target` inside `root`, and not `root` itself? */
function isStrictlyInside(target, root) {
  const rel = path.relative(root, target);
  if (!rel) return false;
  if (rel.startsWith("..")) return false;
  return !path.isAbsolute(rel);
}

function blocked(rule, reason) {
  return { blocked: true, rule, reason };
}

const ALLOWED = { blocked: false, rule: null, reason: null };

/**
 * A path is safe to delete recursively only if we can say for certain that it
 * sits inside the repository. Anything we cannot resolve - a wildcard, an
 * environment variable, a home-directory shorthand - is refused, because the
 * whole point is that we do not find out what it meant afterwards.
 */
function assessDeleteTarget(operand, { repoRoot, cwd }) {
  if (/[*?]/.test(operand)) {
    return blocked(
      "recursive-delete",
      `The delete target \`${operand}\` contains a wildcard, so what it would remove ` +
        `depends on what happens to be on disk at the time. Name the directory instead.`,
    );
  }

  if (/[$%]|^~/.test(operand)) {
    return blocked(
      "recursive-delete",
      `The delete target \`${operand}\` is built from a variable or a home-directory ` +
        `shorthand, so this guard cannot tell what it points at. Write the path out in full.`,
    );
  }

  const resolved = path.resolve(cwd, operand);

  if (samePath(resolved, repoRoot)) {
    return blocked(
      "recursive-delete",
      `That would delete the repository itself (${repoRoot}).`,
    );
  }

  if (samePath(resolved, path.parse(resolved).root)) {
    return blocked("recursive-delete", `That would delete the drive root (${resolved}).`);
  }

  if (!isStrictlyInside(resolved, repoRoot)) {
    return blocked(
      "recursive-delete",
      `\`${operand}\` resolves to ${resolved}, which is outside this repository. ` +
        `Recursive deletes are allowed inside the repo (node_modules, .next, dist) ` +
        `and nowhere else.`,
    );
  }

  return ALLOWED;
}

function assessDelete(tokens, context) {
  const flags = tokens.slice(1).filter((t) => t.startsWith("-"));
  const isRecursive = flags.some(
    (f) => RECURSIVE_FLAG.test(f) || /^-{1,2}recurse$/i.test(f) || /^\/s$/i.test(f),
  );
  if (!isRecursive) return ALLOWED;

  // `-Path` / `-LiteralPath` take their value as the next token; everything
  // else that is not a flag is an operand.
  const operands = [];
  let seenDoubleDash = false;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--") {
      seenDoubleDash = true;
      continue;
    }
    if (!seenDoubleDash && /^-{1,2}(literal)?path$/i.test(token)) {
      if (tokens[i + 1]) operands.push(tokens[i + 1]);
      i += 1;
      continue;
    }
    if (!seenDoubleDash && token.startsWith("-") && token.length > 1) continue;
    if (!seenDoubleDash && token.startsWith("/")&& /^\/[a-zA-Z]$/.test(token)) continue;
    operands.push(token);
  }

  if (operands.length === 0) {
    return blocked(
      "recursive-delete",
      "A recursive delete with no readable target. Refusing rather than guessing.",
    );
  }

  for (const operand of operands) {
    const verdict = assessDeleteTarget(operand, context);
    if (verdict.blocked) return verdict;
  }
  return ALLOWED;
}

/** Which branch does this push actually land on? */
function assessGitPush(tokens, { currentBranch }) {
  const isForce = tokens.some((t) =>
    /^(-f|--force|--force-with-lease(=.*)?|--force-if-includes)$/.test(t),
  );
  if (!isForce) return ALLOWED;

  // Everything after `push` that is not a flag: the remote, then refspecs.
  const pushIndex = tokens.indexOf("push");
  const positional = tokens
    .slice(pushIndex + 1)
    .filter((t) => !t.startsWith("-"));
  const refspecs = positional.slice(1);

  const targetsMain = refspecs.some((ref) => {
    const destination = ref.includes(":") ? ref.split(":").pop() : ref;
    return /^\+?(refs\/heads\/)?main$/.test(destination.replace(/^\+/, ""));
  });

  if (targetsMain) {
    return blocked(
      "force-push-main",
      "This force-pushes `main`. Whatever is on the remote that is not in your " +
        "local history would be gone, and `main` is what production deploys from.",
    );
  }

  if (refspecs.length === 0) {
    // No refspec: this goes to the current branch's upstream.
    if (currentBranch === null) {
      return blocked(
        "force-push-main",
        "A force-push with no branch named, and this guard could not read the current " +
          "branch to work out where it lands. Refusing rather than assuming it is safe.",
      );
    }
    if (currentBranch === "main") {
      return blocked(
        "force-push-main",
        "You are on `main` and this force-pushes with no branch named, so it " +
          "force-pushes `main`.",
      );
    }
  }

  return ALLOWED;
}

function assessGitReset(tokens, { currentBranch }) {
  if (!tokens.includes("--hard")) return ALLOWED;

  if (currentBranch === null) {
    return blocked(
      "reset-hard-main",
      "A `git reset --hard`, and this guard could not read the current branch. " +
        "Refusing rather than assuming it is not `main`.",
    );
  }
  if (currentBranch === "main") {
    return blocked(
      "reset-hard-main",
      "You are on `main`, and `git reset --hard` throws away commits and every " +
        "uncommitted change with no undo.",
    );
  }
  return ALLOWED;
}

function assessGit(tokens, context) {
  if (tokens.includes("push")) return assessGitPush(tokens, context);
  if (tokens.includes("reset")) return assessGitReset(tokens, context);
  return ALLOWED;
}

function assessAzure(tokens) {
  const verbs = tokens.slice(1).filter((t) => !t.startsWith("-"));
  const destructive = verbs.find((v) => AZURE_DESTRUCTIVE_VERBS.has(v.toLowerCase()));
  if (!destructive) return ALLOWED;

  return blocked(
    "azure-delete",
    `\`az ... ${destructive}\` removes a live Azure resource. This repository's ` +
      `production app, its database and its configuration all live in one resource ` +
      `group, and none of it is rebuilt by a deploy.`,
  );
}

/**
 * SQL and Prisma commands that drop data. Deliberately narrow: DROP, TRUNCATE
 * and the Prisma resets. `DELETE FROM` is not matched, because it appears in
 * ordinary source text often enough that blocking it would cost more cycles
 * than it saves - and unlike the others it usually carries a WHERE clause.
 */
function assessDatabase(command) {
  if (/\bdrop\s+(database|schema|table)\b/i.test(command)) {
    return blocked(
      "database-drop",
      "This drops a database, schema or table. `PRODUCTION_PRISMA_MIGRATE` is true " +
        "on this repository, so destructive SQL reaches the live client database.",
    );
  }
  if (/\btruncate\b/i.test(command)) {
    return blocked("database-drop", "This truncates a table. There is no undo.");
  }
  if (/prisma\s+migrate\s+reset/i.test(command)) {
    return blocked(
      "database-drop",
      "`prisma migrate reset` drops the database and replays every migration.",
    );
  }
  if (/prisma\s+db\s+push[^\n]*--force-reset/i.test(command)) {
    return blocked(
      "database-drop",
      "`prisma db push --force-reset` drops the database before pushing the schema.",
    );
  }
  return ALLOWED;
}

/**
 * @param {string} command  the full command line, as typed
 * @param {{ repoRoot: string, cwd?: string, currentBranch: string | null }} context
 * @returns {{ blocked: boolean, rule: string | null, reason: string | null }}
 */
export function assessCommand(command, context) {
  // Fail closed. "The check could not run" is never "the check passed".
  if (typeof command !== "string" || !command.trim()) {
    return blocked("unreadable", "Empty or unreadable command.");
  }
  if (!context || typeof context.repoRoot !== "string" || !context.repoRoot) {
    return blocked(
      "unreadable",
      "This guard was not told where the repository is, so it cannot tell an " +
        "inside-the-repo delete from an outside one.",
    );
  }

  const resolvedContext = {
    repoRoot: path.resolve(context.repoRoot),
    cwd: path.resolve(context.cwd || context.repoRoot),
    currentBranch:
      typeof context.currentBranch === "string" ? context.currentBranch : null,
  };

  for (const pattern of OPAQUE_PATTERNS) {
    if (pattern.test(command)) {
      return blocked(
        "unreadable",
        "This command hands a shell something that cannot be read as text - an " +
          "encoded payload, or a program name that is computed at runtime. Nothing " +
          "here has checked what it does. Write it out plainly and run it again.",
      );
    }
  }

  const databaseVerdict = assessDatabase(command);
  if (databaseVerdict.blocked) return databaseVerdict;

  for (const segment of segments(command)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0) continue;

    const program = path.basename(tokens[0]).replace(/\.(exe|cmd)$/i, "").toLowerCase();

    let verdict = ALLOWED;
    if (DELETE_COMMANDS.has(program)) verdict = assessDelete(tokens, resolvedContext);
    else if (program === "git") verdict = assessGit(tokens, resolvedContext);
    else if (program === "az") verdict = assessAzure(tokens);

    if (verdict.blocked) return verdict;
  }

  return ALLOWED;
}
