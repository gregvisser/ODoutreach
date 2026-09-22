import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSupportAgentDatabaseUrl } from "./resolve-database-url";

const ROOT = process.cwd();
const WORKFLOW = readFileSync(path.join(ROOT, ".github", "workflows", "support-agent.yml"), "utf8");
const RESOLVE_TICKET = readFileSync(path.join(ROOT, "scripts", "support-agent", "resolve-ticket.ts"), "utf8");
const GITIGNORE = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
const GO_LIVE = readFileSync(path.join(ROOT, "docs", "ops", "SUPPORT-AGENT-GO-LIVE.md"), "utf8");
const SUPPORT_DOC = readFileSync(path.join(ROOT, "docs", "SUPPORT_AGENT.md"), "utf8");

describe("support-agent runner contract", () => {
  it("runs on xAI Grok and has no Codex or Claude path", () => {
    expect(WORKFLOW).toContain("node scripts/support-agent/grok-support-runner.mjs");
    expect(WORKFLOW).toContain("secrets.XAI_API_KEY");
    expect(WORKFLOW).toContain("vars.SUPPORT_AGENT_MODEL || 'grok-4.7'");
    expect(WORKFLOW).toContain("name: Run support agent with Grok");
    expect(WORKFLOW).not.toMatch(/openai|codex|anthropic|claude|ANTHROPIC|OPENAI|\/dev\/null/i);
    expect(WORKFLOW).not.toContain("MS_GRAPH");
    expect(WORKFLOW).not.toContain("SUPPORT_AGENT_NOTIFY");
  });

  it("keeps weekday cron behind an explicit default-off variable", () => {
    expect(WORKFLOW).toContain('cron: "0 8-18 * * 1-5"');
    expect(WORKFLOW).toContain("if: github.event_name == 'schedule' && vars.SUPPORT_AGENT_SCHEDULE_ENABLED != 'true'");
    expect(WORKFLOW).toContain("scheduled-hold");
    expect(WORKFLOW).toContain(
      "if: github.ref == 'refs/heads/main' && (github.event_name != 'schedule' || vars.SUPPORT_AGENT_SCHEDULE_ENABLED == 'true')",
    );
    expect(WORKFLOW).toContain("default: authentication-check");
    expect(WORKFLOW).toContain("process-tickets");
  });

  it("caps the model step at 20 minutes and does not pass Graph, notify, or a raw DATABASE_URL", () => {
    const grokStep = WORKFLOW.split("- name: Run support agent with Grok")[1];
    expect(grokStep).toBeTruthy();
    expect(grokStep).toMatch(/^\s*\n\s*timeout-minutes: 20/);
    expect(grokStep).toContain("secrets.XAI_API_KEY");
    expect(grokStep).toContain("secrets.SUPPORT_AGENT_DATABASE_URL");
    expect(grokStep).toContain("secrets.SUPPORT_AGENT_GH_TOKEN");
    expect(grokStep).not.toContain("MS_GRAPH_");
    expect(grokStep).not.toContain("SUPPORT_AGENT_NOTIFY_");
    expect(grokStep).not.toContain("DATABASE_URL: ${{ secrets.");
    expect(WORKFLOW).toContain("timeout-minutes: 45");
  });

  it("names the go-live checklist and keeps scheduled ticket processing gated", () => {
    expect(GO_LIVE).toContain("gh workflow run support-agent.yml --ref main -f mode=authentication-check");
    expect(GO_LIVE).toContain("gh workflow run support-agent.yml --ref main -f mode=process-tickets");
    expect(GO_LIVE).toContain("XAI_API_KEY");
    expect(GO_LIVE).toContain("grok-4.7");
    expect(GO_LIVE).toContain("35598328022");
    expect(GO_LIVE).toContain("SUPPORT_AGENT_DATABASE_URL");
    expect(GO_LIVE).toContain("SUPPORT_AGENT_GH_TOKEN");
    expect(GO_LIVE).toContain("SUPPORT_AGENT_SCHEDULE_ENABLED");
    expect(GO_LIVE).toContain("active");
    expect(GO_LIVE).toMatch(/Do \*\*not\*\*/);
    expect(GO_LIVE).toContain("process-outbound-queue");
    expect(GO_LIVE).toContain("MAILBOX_OAUTH_SECRET");
    expect(GO_LIVE).not.toContain("openai/codex-action");
    expect(SUPPORT_DOC).toContain("XAI_API_KEY");
    expect(SUPPORT_DOC).toContain("grok-4.7");
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
