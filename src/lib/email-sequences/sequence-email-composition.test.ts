import { describe, expect, it } from "vitest";

import {
  composeSequenceEmail,
  emptySequenceCompositionResult,
  SEQUENCE_SEND_REQUIRED_FIELDS,
  type SequenceCompositionContact,
  type SequenceCompositionInput,
  type SequenceCompositionSender,
} from "./sequence-email-composition";

function contact(
  overrides: Partial<SequenceCompositionContact> = {},
): SequenceCompositionContact {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    company: "Analytical Engines",
    role: "Head of Computation",
    website: "https://analytical.example",
    email: "ada@analytical.example",
    mobilePhone: "+44 7000 111222",
    officePhone: "+44 20 7000 3333",
    ...overrides,
  };
}

function sender(
  overrides: Partial<SequenceCompositionSender> = {},
): SequenceCompositionSender {
  return {
    senderName: "Charles Babbage",
    senderEmail: "charles@opensdoors.example",
    senderCompanyName: "Babbage Outreach",
    emailSignature: "—Charles\nBabbage Outreach",
    unsubscribeLink: "https://unsubscribe.example/abc",
    ...overrides,
  };
}

function input(
  overrides: Partial<SequenceCompositionInput> = {},
): SequenceCompositionInput {
  return {
    subject: "Hello {{first_name}} from {{sender_company_name}}",
    content:
      "Hi {{full_name}},\n\n" +
      "We saw {{company_name}} ({{website}}) in the {{role}} space. Reach me at {{sender_email}} or {{phone}}.\n\n" +
      "{{email_signature}}\n\n{{unsubscribe_link}}",
    contact: contact(),
    sender: sender(),
    ...overrides,
  };
}

describe("composeSequenceEmail", () => {
  it("renders every supported placeholder", () => {
    const result = composeSequenceEmail(input());
    expect(result.ok).toBe(true);
    expect(result.sendReady).toBe(true);
    expect(result.subject).toBe("Hello Ada from Babbage Outreach");
    expect(result.body).toContain("Hi Ada Lovelace,");
    expect(result.body).toContain("Analytical Engines");
    expect(result.body).toContain("https://analytical.example");
    expect(result.body).toContain("Head of Computation");
    expect(result.body).toContain("charles@opensdoors.example");
    expect(result.body).toContain("+44 7000 111222");
    expect(result.body).toContain("—Charles\nBabbage Outreach");
    expect(result.body).toContain("https://unsubscribe.example/abc");
    expect(result.unknownPlaceholders).toEqual([]);
    expect(result.missingFields).toEqual([]);
    expect(result.warnings).toEqual([]);
    // usedPlaceholders covers every key referenced at least once.
    expect(result.usedPlaceholders).toEqual(
      expect.arrayContaining([
        "first_name",
        "full_name",
        "company_name",
        "website",
        "role",
        "sender_email",
        "phone",
        "email_signature",
        "unsubscribe_link",
        "sender_company_name",
      ]),
    );
  });

  it("distinguishes company_name (recipient) from sender_company_name", () => {
    const result = composeSequenceEmail(
      input({
        subject: "",
        content: "{{company_name}} vs {{sender_company_name}}",
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.body).toBe("Analytical Engines vs Babbage Outreach");
  });

  it("falls back first_name/last_name from fullName when missing", () => {
    const result = composeSequenceEmail(
      input({
        subject: "{{first_name}} {{last_name}}",
        content: "{{full_name}}",
        contact: contact({
          firstName: null,
          lastName: null,
          fullName: "Grace Brewster Hopper",
        }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.subject).toBe("Grace Brewster Hopper");
    expect(result.body).toBe("Grace Brewster Hopper");
  });

  it("falls back full_name from first+last or email", () => {
    const fromParts = composeSequenceEmail(
      input({
        subject: "",
        content: "{{full_name}}",
        contact: contact({
          firstName: "Alan",
          lastName: "Turing",
          fullName: null,
        }),
      }),
    );
    expect(fromParts.body).toBe("Alan Turing");

    const fromEmail = composeSequenceEmail(
      input({
        subject: "",
        content: "{{full_name}}",
        contact: contact({
          firstName: null,
          lastName: null,
          fullName: null,
          email: "anon@example.com",
        }),
      }),
    );
    expect(fromEmail.body).toBe("anon@example.com");
  });

  it("phone picks mobile first, then office", () => {
    const mobile = composeSequenceEmail(
      input({
        subject: "",
        content: "{{phone}}",
        contact: contact({
          mobilePhone: "+1 555 0000",
          officePhone: "+1 555 9999",
        }),
      }),
    );
    expect(mobile.body).toBe("+1 555 0000");

    const officeOnly = composeSequenceEmail(
      input({
        subject: "",
        content: "{{phone}}",
        contact: contact({
          mobilePhone: null,
          officePhone: "+1 555 9999",
        }),
      }),
    );
    expect(officeOnly.body).toBe("+1 555 9999");
  });

  it("blocks composition on unknown placeholders", () => {
    const result = composeSequenceEmail(
      input({
        subject: "Hi {{nickname}}",
        content: "See {{signature_block}}",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.sendReady).toBe(false);
    expect(result.unknownPlaceholders.sort()).toEqual([
      "nickname",
      "signature_block",
    ]);
    // We keep the unknown tokens in the rendered preview so operators
    // can spot them at a glance in the UI.
    expect(result.subject).toContain("{{nickname}}");
    expect(result.body).toContain("{{signature_block}}");
    expect(result.warnings[0]).toContain("unknown placeholder");
  });

  it("blocks sendReady when contact email is missing", () => {
    const result = composeSequenceEmail(
      input({
        contact: contact({ email: null }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.sendReady).toBe(false);
    expect(result.missingFields).toContain("email");
  });

  it("blocks sendReady when unsubscribe link is missing", () => {
    const result = composeSequenceEmail(
      input({
        sender: sender({ unsubscribeLink: null }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.sendReady).toBe(false);
    expect(result.missingFields).toContain("unsubscribe_link");
  });

  it("inserts the sender email_signature verbatim", () => {
    const result = composeSequenceEmail(
      input({
        subject: "",
        content: "Body\n---\n{{email_signature}}",
        sender: sender({
          emailSignature: "Charles Babbage\nBabbage Outreach\n+44 20",
        }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.body).toBe(
      "Body\n---\nCharles Babbage\nBabbage Outreach\n+44 20",
    );
  });

  it("scans both subject and body for unknown placeholders", () => {
    const result = composeSequenceEmail(
      input({
        subject: "Hi {{pet_name}}",
        content: "plain body",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.unknownPlaceholders).toEqual(["pet_name"]);
  });

  it("reports missingFields even when template does not reference them", () => {
    // Template uses no placeholders — sendReady still requires the
    // send-critical sender fields and a recipient email.
    const result = composeSequenceEmail(
      input({
        subject: "Static subject",
        content: "Static body",
        sender: sender({ unsubscribeLink: null }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.sendReady).toBe(false);
    expect(result.missingFields).toEqual(["unsubscribe_link"]);
  });

  it("does not support camelCase placeholders in D4e.1", () => {
    const result = composeSequenceEmail(
      input({
        subject: "Hi {{firstName}}",
        content: "",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.unknownPlaceholders).toEqual(["firstName"]);
  });

  it("SEQUENCE_SEND_REQUIRED_FIELDS covers email + sender critical fields", () => {
    // Guardrail: if this list shrinks silently, D4e.2 could dispatch
    // without an unsubscribe link or a recipient email.
    expect(SEQUENCE_SEND_REQUIRED_FIELDS).toEqual([
      "email",
      "sender_name",
      "sender_email",
      "sender_company_name",
      "unsubscribe_link",
    ]);
  });

  it("emptySequenceCompositionResult returns a safe not-ready default", () => {
    const empty = emptySequenceCompositionResult();
    expect(empty.ok).toBe(false);
    expect(empty.sendReady).toBe(false);
    expect(empty.subject).toBe("");
    expect(empty.body).toBe("");
    expect(empty.usedPlaceholders).toEqual([]);
    expect(empty.unknownPlaceholders).toEqual([]);
    expect(empty.missingFields).toEqual([]);
  });
});
