import { describe, expect, it } from "vitest";

import type { SenderReadinessCheck, SenderReadinessReport } from "@/lib/sender-readiness";

import {
  filterSenderReadinessChecksForMailboxesOperator,
  MAILBOXES_SENDER_READINESS_EXCLUDED_CHECK_IDS,
  readinessSummaryForMailboxesOperator,
  scrubOperatorReadinessVisibleText,
} from "./sender-readiness-operator-mailboxes";

const baseReport = (): SenderReadinessReport => ({
  headline: "mailbox_outreach_ready",
  summary:
    "Client outreach can send from your connected Microsoft 365 or Google Workspace mailboxes (shared pool). Message delivery and reputation follow each mailbox’s provider, not a global Resend default.",
  effectiveFrom: "a@b.com",
  providerMode: "mock",
  outreachSendsVia: "mailboxes",
  identityStatus: "VERIFIED_READY",
  checks: [
    {
      id: "outreach_mailbox_pool",
      label: "Pool",
      state: "pass",
    },
    {
      id: "legacy_esp",
      label: "Global transport (EMAIL_PROVIDER) — not primary for outreach",
      state: "na",
      detail: "EMAIL_PROVIDER=mock",
    },
    {
      id: "resend_verification",
      label: "Resend (legacy / non-mailbox rows)",
      state: "warn",
    },
  ],
});

describe("filterSenderReadinessChecksForMailboxesOperator", () => {
  it("removes transport-only rows", () => {
    const r = baseReport();
    const f = filterSenderReadinessChecksForMailboxesOperator(r.checks);
    const ids = new Set(f.map((c) => c.id));
    for (const id of MAILBOXES_SENDER_READINESS_EXCLUDED_CHECK_IDS) {
      expect(ids.has(id)).toBe(false);
    }
    expect(f.some((c) => c.label.includes("EMAIL_PROVIDER"))).toBe(false);
  });
});

describe("readinessSummaryForMailboxesOperator", () => {
  it("removes product names and transport jargon for mailbox_outreach_ready", () => {
    const t = readinessSummaryForMailboxesOperator(baseReport());
    expect(t).not.toMatch(/Resend|EMAIL_PROVIDER|global transport/i);
  });
});

describe("scrubOperatorReadinessVisibleText", () => {
  it("strips env keys from check details", () => {
    const o = scrubOperatorReadinessVisibleText("See ALLOWED_SENDER_EMAIL_DOMAINS");
    expect(o).not.toContain("ALLOWED_SENDER");
  });
});

describe("Mailboxes default copy (operator)", () => {
  it("does not expose transport check labels when filtered", () => {
    const list: SenderReadinessCheck[] = baseReport().checks;
    const vis = filterSenderReadinessChecksForMailboxesOperator(list);
    const joined = vis.map((c) => c.label + (c.detail ?? "")).join(" ");
    expect(joined).not.toMatch(/EMAIL_PROVIDER/);
  });
});
