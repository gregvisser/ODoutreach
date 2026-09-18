import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSupportAgentDatabaseUrl } from "./resolve-database-url";

const ROOT = process.cwd();
const WORKFLOW = readFileSync(path.join(ROOT, ".github", "workflows", "support-agent.yml"), "utf8");
const RESOLVE_TICKET = readFileSync(path.join(ROOT, "scripts", "support-agent", "resolve-ticket.ts"), "utf8");
const GITIGNORE = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
const GO_LIVE = readFileSync(path.join(ROOT, "docs", "ops", "SUPPORT-AGENT-GO-LIVE.md"), "utf8");

describe("support-agent runner contract", () => {
  it("is Codex-pinned and has no live Claude Code path", () => {
    expect(WORKFLOW).toContain("openai/codex-action");
    expect(WORKFLOW).toContain("86365089eb2b84e0a8fb0717b304f8bdcb13b20e");
    expect(WORKFLOW).toContain("scripts/support-agent/adapt-codex-action.mjs");
    expect(WORKFLOW).toContain("uses: ./.support-runner/action");
    expect(WORKFLOW).not.toMatch(/anthropics\/claude|claude-code|claude -p|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/);
  });

  it("keeps weekday cron behind an explicit default-off variable", () => {
    expect(WORKFLOW).toContain('cron: "0 8-18 * * 1-5"');
    expect(WORKFLOW).toContain("if: github.event_name == 'schedule' && vars.SUPPORT_AGENT_SCHEDULE_ENABLED != 'true'");
    expect(WORKFLOW).toContain("scheduled-hold");
    expect(WORKFLOW).toContain(
      "if: github.ref == 'refs/heads/main' && (github.event_name != 'schedule' || vars.SUPPORT_AGENT_SCHEDULE_ENABLED == 'true')",
    );
    expect(WORKFLOW).toContain("default: authentication-check");
  });

  it("requires the Codex and ticket secrets by name and does not pass Graph or notify creds into Codex", () => {
    expect(WORKFLOW).toContain("secrets.OPENAI_API_KEY");
    expect(WORKFLOW).toContain("secrets.SUPPORT_AGENT_DATABASE_URL");
    expect(WORKFLOW).toContain("secrets.SUPPORT_AGENT_GH_TOKEN");
    expect(WORKFLOW).toContain("vars.SUPPORT_AGENT_MODEL || 'gpt-5.6-sol'");
    const codexStep = WORKFLOW.split("- name: Run support agent with Codex")[1];
    expect(codexStep).toBeTruthy();
    expect(codexStep).not.toContain("MS_GRAPH_");
    expect(codexStep).not.toContain("SUPPORT_AGENT_NOTIFY_");
    expect(codexStep).not.toContain("DATABASE_URL: ${{ secrets.");
  });

  it("names the go-live checklist and keeps ticket-processing off until Greg flips the gates", () => {
    expect(GO_LIVE).toContain("gh workflow run support-agent.yml --ref main -f mode=authentication-check");
    expect(GO_LIVE).toContain("gh workflow run support-agent.yml --ref main -f mode=process-tickets");
    expect(GO_LIVE).toContain("OPENAI_API_KEY");
    expect(GO_LIVE).toContain("SUPPORT_AGENT_DATABASE_URL");
    expect(GO_LIVE).toContain("SUPPORT_AGENT_GH_TOKEN");
    expect(GO_LIVE).toContain("SUPPORT_AGENT_SCHEDULE_ENABLED");
    expect(GO_LIVE).toContain("disabled_manually");
    expect(GO_LIVE).toMatch(/Do \*\*not\*\*/);
    expect(GO_LIVE).toContain("process-outbound-queue");
    expect(GO_LIVE).toContain("MAILBOX_OAUTH_SECRET");
    expect(GITIGNORE).toContain(".support-runner/");
  });

  it("loads the production DB guard before Prisma in support:resolve", () => {
    const imports = RESOLVE_TICKET.split("\n").filter((line) => line.startsWith("import "));
    expect(imports[0]).toBe('import "./_db";');
    expect(RESOLVE_TICKET).toContain("isSupportNotificationProviderConfigured");
    expect(RESOLVE_TICKET).toContain('notification: "queued"');
  });
});

describe("resolveSupportAgentDatabaseUrl", () => {
  it("prefers SUPPORT_AGENT_DATABASE_URL and refuses a bare DATABASE_URL", () => {
    expect(
      resolveSupportAgentDatabaseUrl({
        SUPPORT_AGENT_DATABASE_URL: "postgres://support",
        PRODUCTION_DATABASE_URL: "postgres://prod",
        DATABASE_URL: "postgres://dev",
      }),
    ).toBe("postgres://support");
    expect(resolveSupportAgentDatabaseUrl({ PRODUCTION_DATABASE_URL: "postgres://prod" })).toBe("postgres://prod");
    expect(() => resolveSupportAgentDatabaseUrl({ DATABASE_URL: "postgres://dev" })).toThrow(/SUPPORT_AGENT_DATABASE_URL/);
    expect(() => resolveSupportAgentDatabaseUrl({})).toThrow(/Refusing to run/);
  });
});
