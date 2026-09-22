import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  AUTH_REPLY_MAX_CHARS,
  AUTH_SYSTEM_PROMPT,
  AUTH_TOKEN,
  AUTH_USER_PROMPT,
  CONSECUTIVE_REFUSAL_AUTO_FINISH,
  CONSECUTIVE_REFUSAL_REMINDER,
  DEFAULT_SUPPORT_MODEL,
  GROK_STEP_TIMEOUT_MINUTES,
  PROCESS_SYSTEM_PROMPT,
  RUNNER_DEADLINE_MS,
  SUPPORT_TOOL_NAMES,
  XAI_CHAT_COMPLETIONS_URL,
  XAI_HTTP_TIMEOUT_MS,
  assertRepoPath,
  childEnv,
  classifyCommand,
  formatLog,
  isAuthenticationOk,
  isToolRefusalLogFields,
  normalizeAuthReply,
  resolveSupportModel,
  runCapturedCommand,
  runSupportAgent,
} from "./grok-support-runner.mjs";

const CANARY = "CANARY_TICKET_BODY_9f3a";
const REPORTER = "reporter@example.com";
const API_KEY = "xai-super-secret-value";

const PARENT_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  XAI_API_KEY: API_KEY,
  OPENAI_API_KEY: "sk-openai-secret",
  ANTHROPIC_API_KEY: "sk-ant-secret",
  MS_GRAPH_CLIENT_SECRET: "graph-secret",
  SUPPORT_AGENT_NOTIFY_SENDER: "notify@example.com",
  MAILBOX_OAUTH_SECRET: "mailbox-secret",
  AUTH_SECRET: "auth-secret-value",
  DATABASE_URL: "postgres://dev.example/dev",
  SUPPORT_AGENT_DATABASE_URL: "postgres://support.example/prod",
  GH_TOKEN: "ghp_test",
  GIT_AUTHOR_NAME: "odoutreach-support-agent",
  GIT_AUTHOR_EMAIL: "support-agent@bidlow.co.uk",
};

function assertPublic(logs) {
  const text = logs.join("\n");
  for (const needle of [
    CANARY,
    REPORTER,
    "notify@example.com",
    "support-agent@bidlow.co.uk",
    API_KEY,
    "sk-openai-secret",
    "sk-ant-secret",
    "graph-secret",
    "mailbox-secret",
    "auth-secret-value",
    "postgres://",
    "ghp_test",
    "UNTRUSTED_TOOL_OUTPUT",
  ]) {
    assert.equal(text.includes(needle), false, `public log leaked ${needle}`);
  }
}

function toolMessage(calls) {
  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "",
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
          })),
        },
      },
    ],
    usage: { completion_tokens: 6 },
  };
}

function scriptedFetch(responses, captured) {
  let index = 0;
  return async (url, init) => {
    const next = responses[index];
    index += 1;
    if (!next) throw new Error(`unexpected xAI call ${index}`);
    captured.push({ url, body: JSON.parse(init.body), authorization: init.headers.authorization });
    if (next.hang) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    }
    return {
      ok: next.ok !== false,
      status: next.status ?? 200,
      json: async () => next.json,
      text: async () => next.text ?? "",
    };
  };
}

test("defaults to grok-4.7 and accepts catalog aliases", () => {
  assert.equal(DEFAULT_SUPPORT_MODEL, "grok-4.7");
  assert.deepEqual(resolveSupportModel(undefined), { ok: true, model: "grok-4.7" });
  assert.deepEqual(resolveSupportModel("  "), { ok: true, model: "grok-4.7" });
  assert.deepEqual(resolveSupportModel("grok-4-7"), { ok: true, model: "grok-4.7" });
  assert.deepEqual(resolveSupportModel("grok-4.6"), { ok: true, model: "grok-4.6" });
  assert.deepEqual(resolveSupportModel("grok-4-6"), { ok: true, model: "grok-4.6" });
  assert.deepEqual(resolveSupportModel("grok-4-0709"), { ok: true, model: "grok-4.6" });
  assert.deepEqual(resolveSupportModel("grok-4-fast-non-reasoning"), { ok: true, model: "grok-4-fast-non-reasoning" });
  assert.equal(resolveSupportModel("gpt-5.6-sol").ok, false);
  assert.equal(resolveSupportModel("claude-haiku-4-5-20251001").ok, false);
  assert.equal(resolveSupportModel("grok-4").ok, false);
});

test("step budget is inside 15–20 minutes and the runner aborts first", () => {
  assert.equal(GROK_STEP_TIMEOUT_MINUTES, 20);
  assert.ok(GROK_STEP_TIMEOUT_MINUTES >= 15 && GROK_STEP_TIMEOUT_MINUTES <= 20);
  assert.equal(RUNNER_DEADLINE_MS, 18 * 60 * 1000);
  assert.ok(RUNNER_DEADLINE_MS < GROK_STEP_TIMEOUT_MINUTES * 60 * 1000);
  assert.ok(XAI_HTTP_TIMEOUT_MS < RUNNER_DEADLINE_MS);
});

test("public log fields drop ticket text, addresses, and secrets", () => {
  const line = formatLog({
    event: "tool",
    name: "list_open_tickets",
    exit: 0,
    note: `${CANARY} please email ${REPORTER}`,
    model: "gpt-5.6-sol",
  });
  assert.match(line, /event=tool/);
  assert.match(line, /name=list_open_tickets/);
  assert.match(line, /exit=0/);
  assert.match(line, /field=redacted/);
  assert.match(line, /model=redacted/);
  assert.equal(line.includes(CANARY), false);
  assert.equal(line.includes(REPORTER), false);
  assert.equal(line.includes("gpt-5.6-sol"), false);
});

test("child environment keeps the ticket DB and gh token and drops model and send secrets", () => {
  const env = childEnv(PARENT_ENV);
  assert.equal(env.SUPPORT_AGENT_DATABASE_URL, PARENT_ENV.SUPPORT_AGENT_DATABASE_URL);
  assert.equal(env.GH_TOKEN, "ghp_test");
  assert.equal(env.GIT_AUTHOR_NAME, "odoutreach-support-agent");
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GH_PROMPT_DISABLED, "1");
  assert.equal(env.GIT_PAGER, "cat");
  assert.equal(env.XAI_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.MS_GRAPH_CLIENT_SECRET, undefined);
  assert.equal(env.SUPPORT_AGENT_NOTIFY_SENDER, undefined);
  assert.equal(env.MAILBOX_OAUTH_SECRET, undefined);
  assert.equal(env.AUTH_SECRET, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
});

test("command allowlist keeps repair commands and refuses send, migrate, and secret rails", () => {
  assert.equal(classifyCommand(["npm", "run", "support:list"]).ok, true);
  assert.equal(classifyCommand(["npm", "run", "support:get", "--", "ticket_1"]).ok, true);
  assert.equal(classifyCommand(["npm", "run", "support:resolve", "--", "ticket_1", "--note", "Fixed the label."]).ok, true);
  assert.equal(classifyCommand(["npm", "run", "lint"]).ok, true);
  assert.equal(classifyCommand(["npm", "test"]).ok, true);
  assert.equal(classifyCommand(["npm", "run", "build"]).ok, true);
  assert.equal(classifyCommand(["git", "status"]).ok, true);
  assert.equal(classifyCommand(["git", "commit", "-m", "support(ticket_1): fix label"]).ok, true);
  assert.equal(classifyCommand(["git", "push", "-u", "origin", "HEAD"]).ok, true);
  assert.equal(classifyCommand(["gh", "pr", "create", "--title", "support(ticket_1): fix label", "--body", "Code-only repair."]).ok, true);

  assert.equal(classifyCommand(["npm", "run", "support:process-notifications"]).reason, "denied_notifications");
  assert.equal(classifyCommand(["npm", "run", "worker:outbound"]).reason, "denied_outbound");
  assert.equal(classifyCommand(["npm", "run", "db:migrate"]).reason, "denied_migrate");
  assert.equal(classifyCommand(["gh", "variable", "set", "SUPPORT_AGENT_SCHEDULE_ENABLED", "--body", "true"]).reason, "denied_secret");
  assert.equal(classifyCommand(["gh", "secret", "set", "XAI_API_KEY"]).reason, "denied_secret");
  assert.equal(classifyCommand(["gh", "pr", "merge", "--admin"]).reason, "denied_gh");
  assert.equal(classifyCommand(["git", "push", "origin", "main"]).reason, "denied_push");
  assert.equal(classifyCommand(["git", "push", "--force", "origin", "HEAD"]).reason, "denied_push");
  assert.equal(classifyCommand(["git", "commit"]).reason, "denied_git");
  assert.equal(classifyCommand(["git", "add", "-A"]).reason, "denied_git");
  assert.equal(classifyCommand(["curl", "https://example.com"]).reason, "denied_bin");
  assert.equal(classifyCommand(["node", "-e", "process.exit(0)"]).reason, "denied_bin");
  assert.equal(classifyCommand(["npm", "run", "support:resolve", "--", "ticket_1", "--note", `see ${REPORTER}`]).reason, "denied_email");
});

test("repo path guard refuses secrets, escapes, and rail files", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const root = mkdtempSync(join(tmpdir(), "grok-support-path-"));
  mkdirSync(join(root, "src"));
  assert.equal(assertRepoPath(root, "src/ok.txt", { write: true }).ok, true);
  assert.equal(assertRepoPath(root, ".env", { write: true }).reason, "secret_path");
  assert.equal(assertRepoPath(root, ".env.local", { write: false }).reason, "secret_path");
  assert.equal(assertRepoPath(root, "../outside.txt", { write: true }).reason, "path_escape");
  const workflow = assertRepoPath(repoRoot, ".github/workflows/support-agent.yml", { write: true });
  assert.equal(workflow.reason, "rail_path");
  const outbound = assertRepoPath(repoRoot, ".github/workflows/process-outbound-queue.yml", { write: true });
  assert.equal(outbound.reason, "rail_path");
  rmSync(root, { recursive: true, force: true });
});

test("auth reply accepts the bare token and common wrappers, and rejects anything else", () => {
  const wrapped = [
    AUTH_TOKEN,
    `  ${AUTH_TOKEN}\n`,
    `\uFEFF${AUTH_TOKEN}`,
    `"${AUTH_TOKEN}"`,
    `'${AUTH_TOKEN}'`,
    `\`${AUTH_TOKEN}\``,
    `\`\`\`\n${AUTH_TOKEN}\n\`\`\``,
    `\`\`\`text\n${AUTH_TOKEN}\n\`\`\``,
    `${AUTH_TOKEN}.`,
    `"${AUTH_TOKEN}".`,
    `"${AUTH_TOKEN}."`,
    `**${AUTH_TOKEN}**`,
    `“${AUTH_TOKEN}”`,
    `${AUTH_TOKEN}!`,
  ];
  for (const reply of wrapped) {
    assert.equal(normalizeAuthReply(reply), AUTH_TOKEN, `normalize ${JSON.stringify(reply)}`);
    assert.equal(isAuthenticationOk(reply), true, `accept ${JSON.stringify(reply)}`);
  }
  const shortSentence = `The connectivity probe is ${AUTH_TOKEN}.`;
  assert.notEqual(normalizeAuthReply(shortSentence), AUTH_TOKEN);
  assert.equal(isAuthenticationOk(shortSentence), true);
  assert.ok(shortSentence.length <= AUTH_REPLY_MAX_CHARS);

  const mismatches = [
    "",
    "   ",
    "hello",
    "ready",
    "Ready",
    "ALREADY",
    "No. I will not continue this probe.",
    `NOT_${AUTH_TOKEN}`,
    `${AUTH_TOKEN}X`,
    `${AUTH_TOKEN} thanks`,
    `${AUTH_TOKEN}\n${AUTH_TOKEN}`,
    `${"completed ".repeat(12)}${AUTH_TOKEN}`,
    `${AUTH_USER_PROMPT}`,
    `${AUTH_SYSTEM_PROMPT}`,
    `hello ${CANARY} ${REPORTER}`,
    `see ${REPORTER} ${AUTH_TOKEN}`,
    `token=${AUTH_TOKEN}`,
  ];
  for (const reply of mismatches) {
    assert.equal(isAuthenticationOk(reply), false, `reject ${JSON.stringify(reply)}`);
  }
  assert.equal(AUTH_TOKEN, "READY");
  assert.equal(AUTH_SYSTEM_PROMPT.includes(AUTH_TOKEN), true);
  assert.equal(AUTH_USER_PROMPT.includes(AUTH_TOKEN), true);
  assert.equal(AUTH_SYSTEM_PROMPT.includes("AUTHENTICATION_OK"), false);
  assert.equal(AUTH_USER_PROMPT.includes("AUTHENTICATION_OK"), false);
  assert.match(AUTH_SYSTEM_PROMPT, /CI connectivity and health probe/);
  assert.match(AUTH_USER_PROMPT, /CI connectivity and health probe/);
  assert.match(AUTH_SYSTEM_PROMPT, /not a password, secret, or login/);
  assert.match(AUTH_USER_PROMPT, /not a password, secret, or login/);
  assert.ok(AUTH_SYSTEM_PROMPT.length > AUTH_REPLY_MAX_CHARS);
  assert.ok(AUTH_USER_PROMPT.length > AUTH_REPLY_MAX_CHARS);
  assert.equal(normalizeAuthReply(null), "");
  assert.equal(isAuthenticationOk(null), false);
});

test("authentication-check calls xAI once and does not run tools", async () => {
  const captured = [];
  const logs = [];
  let spawned = false;
  const result = await runSupportAgent({
    mode: "authentication-check",
    model: "grok-4-7",
    apiKey: API_KEY,
    env: PARENT_ENV,
    deadlineMs: 60_000,
    log: (line) => logs.push(line),
    commandRunner: () => {
      spawned = true;
      throw new Error("auth check must not spawn");
    },
    fetchImpl: scriptedFetch(
      [{ json: { choices: [{ finish_reason: "stop", message: { content: AUTH_TOKEN } }], usage: { completion_tokens: 1 } } }],
      captured,
    ),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(spawned, false);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, XAI_CHAT_COMPLETIONS_URL);
  assert.equal(captured[0].authorization, `Bearer ${API_KEY}`);
  assert.equal(captured[0].body.model, "grok-4.7");
  assert.equal(captured[0].body.temperature, 0);
  assert.equal(captured[0].body.tools, undefined);
  assert.equal(JSON.stringify(captured[0].body).includes(API_KEY), false);
  assert.equal(captured[0].body.messages[0].content, AUTH_SYSTEM_PROMPT);
  assert.equal(captured[0].body.messages[1].content, AUTH_USER_PROMPT);
  assert.match(logs.join("\n"), /event=result status=AUTHENTICATION_OK exit=0/);
  assert.match(logs.join("\n"), new RegExp(`reply_chars=${AUTH_TOKEN.length}`));
  assert.match(logs.join("\n"), /event=xai_response http=200/);
  assert.match(logs.join("\n"), /model=grok-4\.7/);
  assertPublic(logs);
});

test("authentication-check accepts wrapped and short sentence replies without logging them", async () => {
  const replies = [
    `"${AUTH_TOKEN}".`,
    `\`\`\`\n${AUTH_TOKEN}\n\`\`\``,
    `The connectivity probe is ${AUTH_TOKEN}.`,
  ];
  for (const reply of replies) {
    const logs = [];
    const result = await runSupportAgent({
      mode: "authentication-check",
      apiKey: API_KEY,
      log: (line) => logs.push(line),
      fetchImpl: scriptedFetch(
        [{ json: { choices: [{ finish_reason: "stop", message: { content: reply } }], usage: { completion_tokens: 15 } } }],
        [],
      ),
    });
    const text = logs.join("\n");
    assert.equal(result.exitCode, 0, reply);
    assert.match(text, /status=AUTHENTICATION_OK exit=0/);
    assert.match(text, new RegExp(`reply_chars=${reply.length}`));
    assert.equal(text.includes("The connectivity probe"), false);
    assert.equal(text.includes(`"${AUTH_TOKEN}"`), false);
    assertPublic(logs);
  }
});

test("authentication mismatch and HTTP errors do not print the body or the key", async () => {
  const logs = [];
  const mismatch = await runSupportAgent({
    mode: "authentication-check",
    apiKey: API_KEY,
    log: (line) => logs.push(line),
    fetchImpl: scriptedFetch(
      [{ json: { choices: [{ finish_reason: "stop", message: { content: `hello ${CANARY} ${REPORTER}` } }] } }],
      [],
    ),
  });
  assert.equal(mismatch.exitCode, 1);
  assert.match(logs.join("\n"), /status=AUTH_MISMATCH/);
  assert.match(logs.join("\n"), /reply_chars=\d+/);
  assert.equal(logs.join("\n").includes("hello "), false);

  const refusal = "No. I will not continue this probe.";
  const refused = await runSupportAgent({
    mode: "authentication-check",
    apiKey: API_KEY,
    log: (line) => logs.push(line),
    fetchImpl: scriptedFetch(
      [{ json: { choices: [{ finish_reason: "stop", message: { content: refusal } }], usage: { completion_tokens: 12 } } }],
      [],
    ),
  });
  assert.equal(refused.exitCode, 1);
  assert.match(logs.join("\n"), /status=AUTH_MISMATCH/);
  assert.match(logs.join("\n"), new RegExp(`reply_chars=${refusal.length}`));
  assert.equal(logs.join("\n").includes("will not continue"), false);
  assert.equal(logs.join("\n").includes(refusal), false);

  const denied = await runSupportAgent({
    mode: "authentication-check",
    apiKey: API_KEY,
    log: (line) => logs.push(line),
    fetchImpl: scriptedFetch([{ ok: false, status: 401, text: `bad ${API_KEY}` }], []),
  });
  assert.equal(denied.exitCode, 1);
  assert.match(logs.join("\n"), /http=401/);
  assert.equal(logs.join("\n").includes("bad "), false);
  assertPublic(logs);
});

test("rejected models and a missing key never call xAI", async () => {
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    throw new Error("must not fetch");
  };
  const rejected = await runSupportAgent({
    mode: "authentication-check",
    model: "gpt-5.6-sol",
    apiKey: API_KEY,
    fetchImpl,
    log: () => {},
  });
  const missing = await runSupportAgent({
    mode: "process-tickets",
    apiKey: "  ",
    fetchImpl,
    log: () => {},
  });
  const badMode = await runSupportAgent({ mode: "send-mail", apiKey: API_KEY, fetchImpl, log: () => {} });
  assert.equal(rejected.exitCode, 1);
  assert.equal(missing.exitCode, 1);
  assert.equal(badMode.exitCode, 1);
  assert.equal(calls, 0);
});

test("a hung model call times out and is logged", async () => {
  const logs = [];
  const result = await runSupportAgent({
    mode: "authentication-check",
    apiKey: API_KEY,
    deadlineMs: 80,
    log: (line) => logs.push(line),
    fetchImpl: scriptedFetch([{ hang: true }], []),
  });
  assert.equal(result.exitCode, 124);
  assert.match(logs.join("\n"), /event=timeout/);
  assert.match(logs.join("\n"), /exit=124/);
  assert.match(logs.join("\n"), /event=xai_request/);
  assertPublic(logs);
});

test("SIGTERM during a model call exits 143", async () => {
  const controller = new AbortController();
  const logs = [];
  const result = await runSupportAgent({
    mode: "authentication-check",
    apiKey: API_KEY,
    signal: controller.signal,
    signalName: "SIGTERM",
    log: (line) => logs.push(line),
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
        controller.abort();
      }),
  });
  assert.equal(result.exitCode, 143);
  assert.match(logs.join("\n"), /event=signal signal=SIGTERM exit=143/);
});

test("process-tickets lists privately, refuses send, and does not log ticket bodies", async () => {
  const captured = [];
  const logs = [];
  const spawned = [];
  const ticket = JSON.stringify([
    { id: "ticket_1", title: "Label", description: CANARY, reporterEmail: REPORTER },
  ]);
  const result = await runSupportAgent({
    mode: "process-tickets",
    apiKey: API_KEY,
    env: PARENT_ENV,
    cwd: process.cwd(),
    deadlineMs: 60_000,
    log: (line) => logs.push(line),
    commandRunner: async (argv, context) => {
      spawned.push({ argv, env: context.env });
      if (argv[2] === "support:process-notifications") throw new Error("notifications must not run");
      return { exitCode: 0, stdout: `> support:list\n\n${ticket}\n`, stderr: "", elapsed: 12, timedOut: false };
    },
    fetchImpl: scriptedFetch(
      [
        {
          json: toolMessage([
            { id: "call_list", name: "list_open_tickets", args: {} },
            { id: "call_send", name: "run_repo_command", args: { argv: ["npm", "run", "support:process-notifications"] } },
          ]),
        },
        { json: toolMessage([{ id: "call_done", name: "finish", args: { status: "PASS" } }]) },
      ],
      captured,
    ),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0].argv, ["npm", "run", "support:list"]);
  assert.equal(spawned[0].env.XAI_API_KEY, undefined);
  assert.equal(spawned[0].env.MS_GRAPH_CLIENT_SECRET, undefined);
  assert.equal(spawned[0].env.SUPPORT_AGENT_NOTIFY_SENDER, undefined);
  assert.equal(spawned[0].env.DATABASE_URL, undefined);
  assert.equal(spawned[0].env.SUPPORT_AGENT_DATABASE_URL, PARENT_ENV.SUPPORT_AGENT_DATABASE_URL);
  assert.equal(spawned[0].env.GH_TOKEN, "ghp_test");
  const text = logs.join("\n");
  assert.match(text, /name=list_open_tickets/);
  assert.match(text, /open_count=1/);
  assert.match(text, /exit=0/);
  assert.match(text, /reason=denied_notifications/);
  assert.match(text, /event=finish status=PASS/);
  assert.equal(text.includes(CANARY), false);
  assertPublic(logs);
  assert.equal(captured[0].body.model, "grok-4.7");
  assert.equal(captured[0].body.temperature, undefined);
  assert.deepEqual(
    captured[0].body.tools.map((tool) => tool.function.name),
    SUPPORT_TOOL_NAMES,
  );
  assert.match(captured[0].body.messages[0].content, /do-not-contact/);
  assert.match(captured[0].body.messages[0].content, /tracking-off/);
  assert.equal(JSON.stringify(captured[0].body).includes(CANARY), false);
  assert.equal(JSON.stringify(captured[1].body).includes(CANARY), true);
  assert.match(PROCESS_SYSTEM_PROMPT, /SUPPORT_AGENT_SCHEDULE_ENABLED/);
  assert.match(AUTH_USER_PROMPT, /READY/);
  assert.equal(AUTH_USER_PROMPT.includes("AUTHENTICATION_OK"), false);
});

test("PASS before list_open_tickets is refused", async () => {
  const logs = [];
  let spawned = false;
  const result = await runSupportAgent({
    mode: "process-tickets",
    apiKey: API_KEY,
    log: (line) => logs.push(line),
    commandRunner: () => {
      spawned = true;
      throw new Error("must not spawn");
    },
    fetchImpl: scriptedFetch(
      [
        { json: toolMessage([{ id: "call_pass", name: "finish", args: { status: "PASS" } }]) },
        { json: toolMessage([{ id: "call_hold", name: "finish", args: { status: "UNVERIFIED" } }]) },
      ],
      [],
    ),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(spawned, false);
  assert.match(logs.join("\n"), /reason=pass_before_list/);
  assert.match(logs.join("\n"), /status=UNVERIFIED/);
});

test("write_file stores source and refuses .env without logging contents", async () => {
  const root = mkdtempSync(join(tmpdir(), "grok-support-write-"));
  mkdirSync(join(root, "src"));
  const logs = [];
  const result = await runSupportAgent({
    mode: "process-tickets",
    apiKey: API_KEY,
    cwd: root,
    log: (line) => logs.push(line),
    commandRunner: async () => ({ exitCode: 0, stdout: "[]", stderr: "", elapsed: 3, timedOut: false }),
    fetchImpl: scriptedFetch(
      [
        { json: toolMessage([{ id: "call_list", name: "list_open_tickets", args: {} }]) },
        {
          json: toolMessage([
            { id: "call_write", name: "write_file", args: { path: "src/ok.txt", contents: CANARY } },
            { id: "call_env", name: "write_file", args: { path: ".env", contents: `${CANARY} ${API_KEY}` } },
          ]),
        },
        { json: toolMessage([{ id: "call_done", name: "finish", args: { status: "PASS" } }]) },
      ],
      [],
    ),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(readFileSync(join(root, "src", "ok.txt"), "utf8"), CANARY);
  assert.equal(existsSync(join(root, ".env")), false);
  assertPublic(logs);
  assert.match(logs.join("\n"), /name=write_file/);
  assert.match(logs.join("\n"), /reason=secret_path/);
  rmSync(root, { recursive: true, force: true });
});

test("captured command stdout is returned to the caller", async () => {
  const result = await runCapturedCommand(
    [process.execPath, "-e", `process.stdout.write(${JSON.stringify(`${CANARY} ${REPORTER}`)})`],
    { cwd: process.cwd(), env: process.env, timeoutMs: 5000 },
  );
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, new RegExp(CANARY));
});

test("workflow no longer invokes Codex or discards model output", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/support-agent.yml", import.meta.url), "utf8");
  assert.match(workflow, /node scripts\/support-agent\/grok-support-runner\.mjs/);
  assert.match(workflow, /secrets\.XAI_API_KEY/);
  assert.match(workflow, /grok-4\.7/);
  assert.match(workflow, /name: Run support agent with Grok\n\s+timeout-minutes: 20/);
  assert.match(workflow, /scheduled-hold/);
  assert.match(workflow, /SUPPORT_AGENT_SCHEDULE_ENABLED/);
  assert.equal(workflow.includes("openai"), false);
  assert.equal(workflow.includes("codex"), false);
  assert.equal(workflow.includes("/dev/null"), false);
  assert.equal(workflow.includes("ANTHROPIC"), false);
  assert.equal(workflow.includes("MS_GRAPH"), false);
  assert.equal(workflow.includes("SUPPORT_AGENT_NOTIFY"), false);
  assert.equal(workflow.includes("OPENAI"), false);
});

test("write probe does not create .env", () => {
  const root = mkdtempSync(join(tmpdir(), "grok-support-env-"));
  writeFileSync(join(root, "keep.txt"), "ok");
  assert.equal(assertRepoPath(root, ".env", { write: true }).ok, false);
  rmSync(root, { recursive: true, force: true });
});

test("isToolRefusalLogFields treats failed tools as refusals but not finish or success", () => {
  assert.equal(isToolRefusalLogFields({ event: "tool", name: "run_repo_command", exit: 1, reason: "denied_git" }), true);
  assert.equal(isToolRefusalLogFields({ event: "tool", name: "read_file", exit: 1, reason: "path" }), true);
  assert.equal(isToolRefusalLogFields({ event: "tool", name: "read_file", exit: 0 }), false);
  assert.equal(isToolRefusalLogFields({ event: "tool", name: "finish", exit: 1, reason: "pass_before_list" }), false);
  assert.equal(isToolRefusalLogFields({ event: "finish", status: "UNVERIFIED", exit: 0 }), false);
});

test("consecutive refused tools auto-finish UNVERIFIED before round limit", async () => {
  const captured = [];
  const logs = [];
  const deniedCall = (id) => ({
    id,
    name: "run_repo_command",
    args: { argv: ["git", "commit"] },
  });
  const responses = [];
  for (let i = 0; i < CONSECUTIVE_REFUSAL_AUTO_FINISH; i += 1) {
    responses.push({ json: toolMessage([deniedCall(`call_${i}`)]) });
  }
  const result = await runSupportAgent({
    mode: "process-tickets",
    apiKey: API_KEY,
    log: (line) => logs.push(line),
    commandRunner: () => {
      throw new Error("denied git must not spawn");
    },
    fetchImpl: scriptedFetch(responses, captured),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(captured.length, CONSECUTIVE_REFUSAL_AUTO_FINISH);
  const text = logs.join("\n");
  assert.match(text, /reason=consecutive_refusals/);
  assert.match(text, /event=finish status=UNVERIFIED/);
  assert.equal(text.includes("ROUND_LIMIT"), false);
  assertPublic(logs);
});

test("refusal reminder is sent to the model after several consecutive refusals", async () => {
  const captured = [];
  const deniedCall = (id) => ({
    id,
    name: "run_repo_command",
    args: { argv: ["git", "add", "-A"] },
  });
  const responses = [];
  for (let i = 0; i < CONSECUTIVE_REFUSAL_REMINDER + 1; i += 1) {
    responses.push({ json: toolMessage([deniedCall(`call_${i}`)]) });
  }
  await runSupportAgent({
    mode: "process-tickets",
    apiKey: API_KEY,
    log: () => {},
    commandRunner: () => {
      throw new Error("denied git must not spawn");
    },
    fetchImpl: scriptedFetch(responses, captured),
  });
  assert.ok(captured.length >= CONSECUTIVE_REFUSAL_REMINDER + 1);
  const lastRequest = captured[CONSECUTIVE_REFUSAL_REMINDER].body.messages;
  const reminder = lastRequest.find((message) => message.role === "user" && message.content?.includes("finish tool"));
  assert.ok(reminder, "expected refusal reminder user message before next model round");
  assert.equal(JSON.stringify(captured).includes("UNVERIFIED"), true);
});

test("round limit ends with finish UNVERIFIED instead of exit-only ROUND_LIMIT", async () => {
  const logs = [];
  const rounds = 4;
  const responses = [];
  for (let i = 0; i < rounds; i += 1) {
    responses.push({
      json: toolMessage([
        {
          id: `call_list_${i}`,
          name: "list_open_tickets",
          args: {},
        },
      ]),
    });
  }
  responses.push({
    json: toolMessage([{ id: "call_stall", name: "read_file", args: { path: "does-not-exist.txt" } }]),
  });
  const result = await runSupportAgent({
    mode: "process-tickets",
    apiKey: API_KEY,
    maxModelRounds: rounds,
    cwd: process.cwd(),
    log: (line) => logs.push(line),
    commandRunner: async () => ({ exitCode: 0, stdout: "[]", stderr: "", elapsed: 2, timedOut: false }),
    fetchImpl: scriptedFetch(responses, []),
  });
  assert.equal(result.exitCode, 0);
  const text = logs.join("\n");
  assert.match(text, /reason=round_limit/);
  assert.match(text, /status=ROUND_LIMIT/);
  assert.match(text, /event=finish status=UNVERIFIED/);
  assertPublic(logs);
});
