import { describe, expect, it } from "vitest";

import { composeSequenceEmail } from "@/lib/email-sequences/sequence-email-composition";
import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";
import { buildMailboxGovernedEmailBodies } from "@/lib/unsubscribe/outreach-mailbox-bodies";

import {
  PREVIEW_BODY_DB_MAX,
  PREVIEW_SUBJECT_DB_MAX,
  renderOutreachEmail,
  type RenderOutreachEmailInput,
} from "./render-outreach-email";

// A mailbox shaped exactly like the ClientMailboxIdentity fields the send path
// passes to buildMailboxGovernedEmailBodies (send-introduction.ts:937-946).
const mailbox = {
  provider: "GOOGLE" as const,
  email: "luke.smith@morsonfm.co.uk",
  displayName: "Luke Smith",
  senderDisplayName: "Luke Smith",
  senderSignatureHtml: "<p>Luke Smith<br />Morson FM &middot; 0161 000 0000</p>",
  senderSignatureText: "Luke Smith\nMorson FM",
  senderSignatureSource: "SET_IN_ODOUTREACH",
  senderSignatureSyncedAt: null,
  senderSignatureSyncError: null,
};

const sender = {
  senderName: "Luke Smith",
  senderEmail: "luke.smith@morsonfm.co.uk",
  senderCompanyName: "Morson FM",
  emailSignature: "Luke Smith\nMorson FM",
  unsubscribeLink: "https://app.opensdoors.test/unsubscribe/SAMPLE",
};

const contact = {
  firstName: "Cameron",
  lastName: "Grant",
  fullName: "Cameron Grant",
  company: "Octavian Group",
  role: "Facilities Lead",
  email: "cameron@octaviangr.com",
  website: null,
  mobilePhone: null,
  officePhone: null,
};

const baseInput: RenderOutreachEmailInput = {
  subject: "Hi {{first_name}} — support for {{company_name}}",
  content:
    "Hi {{first_name}},\n\nWe help teams at {{company_name}} with office maintenance.\n\nWorth a quick chat?\n\n{{email_signature}}",
  contact,
  sender,
  mailbox,
  unsubscribeUrl: "https://app.opensdoors.test/unsubscribe/SAMPLE",
  hostedUnsubscribeUrl: "https://app.opensdoors.test/unsubscribe/SAMPLE",
};

/**
 * Reconstructs EXACTLY what the live send path produces for the same inputs:
 *   Stage A (send-introduction.ts): compose → truncate(subject) →
 *     ensureUnsubscribeLinkInPlainTextBody → truncate(body) = bodySnapshot.
 *   Stage B (execute-one.ts): buildMailboxGovernedEmailBodies(bodySnapshot, ...).
 */
function reconstructSendRender(input: RenderOutreachEmailInput) {
  const composition = composeSequenceEmail({
    subject: input.subject,
    content: input.content,
    contact: input.contact,
    sender: input.sender,
  });
  const truncate = (v: string, max: number) =>
    v.length <= max ? v : v.slice(0, Math.max(0, max - 1)) + "…";
  const sendSubject = truncate(composition.subject, PREVIEW_SUBJECT_DB_MAX);
  const bodySnapshot = truncate(
    ensureUnsubscribeLinkInPlainTextBody(composition.body, input.unsubscribeUrl),
    PREVIEW_BODY_DB_MAX,
  );
  const bodies = buildMailboxGovernedEmailBodies({
    bodySnapshotPlain: bodySnapshot,
    mailbox: input.mailbox,
    hostedUnsubscribeUrl: input.hostedUnsubscribeUrl,
  });
  return { subject: sendSubject, bodyText: bodies.text, html: bodies.html };
}

describe("Feature B — renderOutreachEmail parity (preview == send render)", () => {
  it("produces byte-identical subject/text/html to the reconstructed send path", () => {
    const preview = renderOutreachEmail(baseInput);
    const send = reconstructSendRender(baseInput);

    expect(preview.subject).toBe(send.subject);
    expect(preview.bodyText).toBe(send.bodyText);
    expect(preview.html).toBe(send.html);
  });

  it("resolves merge fields against the selected contact and injects the identity signature", () => {
    const preview = renderOutreachEmail(baseInput);

    // Merge fields resolved from the contact.
    expect(preview.subject).toBe("Hi Cameron — support for Octavian Group");
    expect(preview.html).toContain("Cameron");
    expect(preview.html).toContain("Octavian Group");
    // Real branded signature for the selected sending identity is present.
    expect(preview.html).toContain("Morson FM");
    // Unsubscribe footer is rendered as an anchor.
    expect(preview.html).toContain(">Unsubscribe</a>");
  });

  it("stays in parity when the subject exceeds the DB truncation limit", () => {
    const longInput: RenderOutreachEmailInput = {
      ...baseInput,
      subject: "X".repeat(PREVIEW_SUBJECT_DB_MAX + 50),
    };
    const preview = renderOutreachEmail(longInput);
    const send = reconstructSendRender(longInput);

    expect(preview.subject).toBe(send.subject);
    expect(preview.subject.length).toBe(PREVIEW_SUBJECT_DB_MAX);
    expect(preview.subject.endsWith("…")).toBe(true);
  });
});
