import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { adaptActionText, FINAL_COMMAND } from "./adapt-codex-action.mjs";

const fixture = (command = FINAL_COMMAND) => `runs:\n  using: composite\n  steps:\n    - shell: bash\n      run: |\n        printf 'setup\\n'\n        ${command} \\\n            --prompt "${"${CODEX_PROMPT}"}" \\\n            --codex-user "${"${CODEX_USER}"}"\n`;

test("changes only the final invocation and suppresses all private output", () => {
  const source = fixture();
  const adapted = adaptActionText(source);
  const expected = source
    .replace(FINAL_COMMAND, FINAL_COMMAND.replace(
      "exec env -u NODE_OPTIONS NODE_OPTIONS=--disable-sigusr1",
      "exec env -u NODE_OPTIONS GITHUB_OUTPUT=/dev/null GITHUB_STEP_SUMMARY=/dev/null NODE_OPTIONS=--disable-sigusr1",
    ))
    .replace(/(--codex-user "\$\{CODEX_USER\}")\n$/, "$1 > /dev/null 2>&1\n");
  assert.equal(adapted, expected);
  assert.match(adapted, /GITHUB_OUTPUT=\/dev\/null GITHUB_STEP_SUMMARY=\/dev\/null/);
  assert.match(adapted, /> \/dev\/null 2>&1/);
});

test("fails closed when the upstream command is missing or duplicated", () => {
  assert.throws(() => adaptActionText(fixture("echo changed")), /exactly one/);
  assert.throws(() => adaptActionText(`${fixture()}${fixture()}`), /exactly one/);
});

test("synthetic stdout, stderr, and GitHub output canaries cannot escape", (t) => {
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  try {
    execFileSync(bash, ["-lc", "true"], { stdio: "ignore" });
  } catch {
    t.skip("bash is unavailable on this host");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "support-adapter-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "node"), "#!/bin/sh\nprintf 'PRIVATE_STDOUT\\n'\nprintf 'PRIVATE_STDERR\\n' >&2\nprintf 'PRIVATE_OUTPUT\\n' >> \"$GITHUB_OUTPUT\"\nprintf 'PRIVATE_SUMMARY\\n' >> \"$GITHUB_STEP_SUMMARY\"\nexit \"$FAKE_EXIT\"\n", { mode: 0o755 });
  const script = join(root, "run.sh");
  const source = `set -euo pipefail\n${fixture().split("run: |\n")[1]}`;
  const adapted = adaptActionText(source);
  writeFileSync(script, `cd "$(dirname "$0")"\nexport PATH="$PWD/bin:$PATH"\n${adapted}`);
  for (const exitCode of [0, 7]) {
    const result = spawnSync(bash, [script.replaceAll("\\", "/")], { encoding: "utf8", env: { ...process.env, ACTION_PATH: root, CODEX_PROMPT: "synthetic", CODEX_USER: "runner", FAKE_EXIT: String(exitCode), GITHUB_OUTPUT: join(root, "output"), GITHUB_STEP_SUMMARY: join(root, "summary") } });
    assert.equal(result.status, exitCode, result.stderr);
    assert.equal(result.stdout, "setup\n");
    assert.equal(result.stderr, "");
    assert.equal(existsSync(join(root, "output")), false);
    assert.equal(existsSync(join(root, "summary")), false);
  }
});
