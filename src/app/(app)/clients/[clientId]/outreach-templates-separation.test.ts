import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const outreachPage = join(root, "src/app/(app)/clients/[clientId]/outreach/page.tsx");
const templatesPage = join(root, "src/app/(app)/clients/[clientId]/templates/page.tsx");
const templatesPanel = join(root, "src/components/clients/email-templates/client-email-templates-panel.tsx");

describe("Templates separated from Outreach", () => {
  it("does not embed the templates panel on the Outreach page", () => {
    const src = readFileSync(outreachPage, "utf8");
    expect(src).not.toContain("ClientEmailTemplatesPanel");
    expect(src).not.toContain("loadClientEmailTemplatesOverview");
    expect(src).not.toContain("getClientEmailTemplateMutationAllowed");
    expect(src).toContain("/templates");
    expect(src).toContain("Manage templates");
  });

  it("keeps staff-facing approval / revert phrases off the Outreach page source", () => {
    const src = readFileSync(outreachPage, "utf8");
    expect(src).not.toMatch(/\bApprove\b/i);
    expect(src).not.toContain("Return to draft");
    expect(src).not.toContain("Pull back to draft");
    expect(src).not.toContain("ready for review");
    expect(src).not.toContain("template approval");
  });

  it("hosts template creation UI on the Templates route", () => {
    const src = readFileSync(templatesPage, "utf8");
    expect(src).toContain("ClientEmailTemplatesPanel");
    expect(src).toContain("loadClientEmailTemplatesOverview");
    expect(src).toContain("Create reusable email templates");
  });

  it("keeps approval ceremony copy off the templates panel source", () => {
    const src = readFileSync(templatesPanel, "utf8");
    expect(src).not.toContain("Mark ready for review");
    expect(src).not.toContain("approveClientEmailTemplateAction");
    expect(src).not.toContain("Return to draft");
    expect(src).not.toContain("Pull back to draft");
    expect(src).not.toContain("Approved by");
    expect(src).not.toContain("approval blocked");
    expect(src).not.toContain("Awaiting OpensDoors approval");
  });
});
