import { describe, expect, it } from "vitest";

import {
  ALL_PLACEHOLDERS,
  extractPlaceholders,
  isKnownPlaceholder,
  RECIPIENT_PLACEHOLDERS,
  SENDER_PLACEHOLDERS,
  validateTemplatePlaceholders,
} from "./placeholders";

describe("email template placeholders", () => {
  it("includes every recipient and sender placeholder from the spec", () => {
    const keys = new Set(ALL_PLACEHOLDERS.map((p) => p.key));

    // Recipient / company
    expect(keys).toContain("first_name");
    expect(keys).toContain("last_name");
    expect(keys).toContain("full_name");
    expect(keys).toContain("company_name");
    expect(keys).toContain("role");
    expect(keys).toContain("website");
    expect(keys).toContain("email");
    expect(keys).toContain("phone");

    // Sender / client
    expect(keys).toContain("sender_name");
    expect(keys).toContain("sender_email");
    expect(keys).toContain("sender_company_name");
    expect(keys).toContain("email_signature");
    expect(keys).toContain("unsubscribe_link");
  });

  it("keeps recipient and sender groups disjoint", () => {
    const recipient = new Set(RECIPIENT_PLACEHOLDERS.map((p) => p.key));
    const sender = new Set(SENDER_PLACEHOLDERS.map((p) => p.key));
    for (const key of recipient) {
      expect(sender.has(key)).toBe(false);
    }
    expect(recipient.size + sender.size).toBe(ALL_PLACEHOLDERS.length);
  });

  it("distinguishes sender_company_name from target company_name", () => {
    expect(isKnownPlaceholder("sender_company_name")).toBe(true);
    expect(isKnownPlaceholder("company_name")).toBe(true);
    const sender = ALL_PLACEHOLDERS.find((p) => p.key === "sender_company_name");
    const recipient = ALL_PLACEHOLDERS.find((p) => p.key === "company_name");
    expect(sender?.group).toBe("sender");
    expect(recipient?.group).toBe("recipient");
  });

  it("rejects camelCase aliases — UI only promotes snake_case", () => {
    expect(isKnownPlaceholder("firstName")).toBe(false);
    expect(isKnownPlaceholder("senderName")).toBe(false);
    expect(isKnownPlaceholder("companyName")).toBe(false);
  });
});

describe("extractPlaceholders", () => {
  it("extracts from subject and content, tolerating whitespace inside braces", () => {
    const { all, unique } = extractPlaceholders(
      "Hi {{first_name}}",
      "Work at {{ company_name }}? Cheers {{sender_name}}",
    );
    expect(all).toEqual(["first_name", "company_name", "sender_name"]);
    expect(unique.sort()).toEqual(["company_name", "first_name", "sender_name"]);
  });

  it("preserves duplicates in `all` but deduplicates in `unique`", () => {
    const { all, unique } = extractPlaceholders(
      "{{first_name}} {{first_name}} {{role}}",
    );
    expect(all).toEqual(["first_name", "first_name", "role"]);
    expect(unique.sort()).toEqual(["first_name", "role"]);
  });

  it("ignores non-placeholder braces and malformed tokens", () => {
    const { unique } = extractPlaceholders(
      "Not {a placeholder} and {{ }} empty and {{ weird-key }} skipped",
    );
    // `weird-key` contains a hyphen so regex does not match
    expect(unique).toEqual([]);
  });

  it("skips empty / non-string inputs gracefully", () => {
    const { all } = extractPlaceholders("", "   ", "hello {{email}}");
    expect(all).toEqual(["email"]);
  });
});

describe("validateTemplatePlaceholders", () => {
  it("returns all placeholders as known when all are supported", () => {
    const res = validateTemplatePlaceholders(
      "Hi {{first_name}} at {{company_name}}",
      "Regards {{sender_name}} ({{sender_company_name}})\n{{email_signature}}\n{{unsubscribe_link}}",
    );
    expect(res.unknown).toEqual([]);
    expect(res.knownUsed.sort()).toEqual([
      "company_name",
      "email_signature",
      "first_name",
      "sender_company_name",
      "sender_name",
      "unsubscribe_link",
    ]);
  });

  it("flags unknown placeholders from subject or content", () => {
    const res = validateTemplatePlaceholders(
      "Hi {{first_name}} about {{deal_amount}}",
      "Regards {{sender_name}} / {{mystery}}",
    );
    expect(res.unknown.sort()).toEqual(["deal_amount", "mystery"]);
    expect(res.knownUsed.sort()).toEqual(["first_name", "sender_name"]);
  });

  it("treats camelCase aliases as unknown", () => {
    const res = validateTemplatePlaceholders(
      "Hi {{firstName}}",
      "Cheers {{senderName}}",
    );
    expect(res.unknown.sort()).toEqual(["firstName", "senderName"]);
    expect(res.knownUsed).toEqual([]);
  });
});
