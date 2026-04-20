import { describe, expect, it } from "vitest";

import {
  CANONICAL_IMPORT_HEADINGS,
  EMAIL_REQUIRED_FOR_PERSISTENCE,
  mapContactRow,
  normalizeHeading,
  rowHasOutreachIdentifier,
  rowIsEmailSendable,
} from "./contact-import-contract";

describe("contact import contract — canonical headings", () => {
  it("exposes the exact heading list Greg approved", () => {
    expect([...CANONICAL_IMPORT_HEADINGS]).toEqual([
      "Name",
      "Employer",
      "Title",
      "First Name",
      "Last Name",
      "Location",
      "City",
      "Country",
      "LinkedIn",
      "Job1 Title",
      "A Emails",
      "Mobile Phone Number",
      "Office Number",
    ]);
  });

  it("keeps email-required-for-persistence flag true until the follow-up lands", () => {
    expect(EMAIL_REQUIRED_FOR_PERSISTENCE).toBe(true);
  });

  it("normalizes headings case-insensitively and collapses whitespace", () => {
    expect(normalizeHeading("  LinkedIn  ")).toBe("linkedin");
    expect(normalizeHeading("Mobile Phone Number")).toBe(
      "mobile phone number",
    );
    expect(normalizeHeading("A\tEmails")).toBe("a emails");
  });
});

describe("contact import contract — row mapping", () => {
  it("maps a fully populated row using the canonical headings", () => {
    const mapped = mapContactRow({
      Name: "Ada Lovelace",
      Employer: "Analytical Engine Co",
      Title: "Chief Algorithmist",
      "First Name": "Ada",
      "Last Name": "Lovelace",
      Location: "London, UK",
      City: "London",
      Country: "UK",
      LinkedIn: "https://linkedin.com/in/ada",
      "Job1 Title": "Mathematician",
      "A Emails": "ada@example.com",
      "Mobile Phone Number": "+44 7000 000000",
      "Office Number": "+44 20 0000 0000",
    });

    expect(mapped).toEqual({
      fullName: "Ada Lovelace",
      company: "Analytical Engine Co",
      title: "Chief Algorithmist",
      firstName: "Ada",
      lastName: "Lovelace",
      location: "London, UK",
      city: "London",
      country: "UK",
      linkedIn: "https://linkedin.com/in/ada",
      email: "ada@example.com",
      mobilePhone: "+44 7000 000000",
      officePhone: "+44 20 0000 0000",
    });
  });

  it("maps `A Emails` to email and `Employer` to company", () => {
    const mapped = mapContactRow({
      Employer: "Example Co",
      "A Emails": "op@example.com",
    });
    expect(mapped.company).toBe("Example Co");
    expect(mapped.email).toBe("op@example.com");
  });

  it("uses `Job1 Title` only as a fallback when Title is empty", () => {
    const both = mapContactRow({ Title: "CTO", "Job1 Title": "Engineer" });
    expect(both.title).toBe("CTO");

    const jobOnly = mapContactRow({ "Job1 Title": "Engineer" });
    expect(jobOnly.title).toBe("Engineer");

    const emptyTitle = mapContactRow({ Title: "   ", "Job1 Title": "Engineer" });
    expect(emptyTitle.title).toBe("Engineer");
  });

  it("accepts empty optional fields", () => {
    const mapped = mapContactRow({
      "A Emails": "",
      LinkedIn: "",
      "Mobile Phone Number": "",
      "Office Number": "",
      City: "",
      Country: "",
    });

    expect(mapped.email).toBe("");
    expect(mapped.linkedIn).toBe("");
    expect(mapped.mobilePhone).toBe("");
    expect(mapped.officePhone).toBe("");
    expect(rowHasOutreachIdentifier(mapped)).toBe(false);
    expect(rowIsEmailSendable(mapped)).toBe(false);
  });

  it("still accepts the legacy CSV headings already in use", () => {
    const mapped = mapContactRow({
      email: "op@example.com",
      company: "Legacy Co",
      title: "Staff",
      first_name: "Op",
      last_name: "Erator",
      full_name: "Op Erator",
    });
    expect(mapped.email).toBe("op@example.com");
    expect(mapped.company).toBe("Legacy Co");
    expect(mapped.title).toBe("Staff");
    expect(mapped.firstName).toBe("Op");
    expect(mapped.lastName).toBe("Erator");
    expect(mapped.fullName).toBe("Op Erator");
  });
});

describe("contact import contract — validity rules", () => {
  it("treats an email-only row as valid and email-sendable", () => {
    const mapped = mapContactRow({ "A Emails": "op@example.com" });
    expect(rowHasOutreachIdentifier(mapped)).toBe(true);
    expect(rowIsEmailSendable(mapped)).toBe(true);
  });

  it("treats a LinkedIn-only row as a valid (non-email-sendable) contact intake", () => {
    const mapped = mapContactRow({ LinkedIn: "https://linkedin.com/in/op" });
    expect(rowHasOutreachIdentifier(mapped)).toBe(true);
    expect(rowIsEmailSendable(mapped)).toBe(false);
  });

  it("treats a mobile-phone-only row as a valid (non-email-sendable) contact intake", () => {
    const mapped = mapContactRow({ "Mobile Phone Number": "+44 7000 000000" });
    expect(rowHasOutreachIdentifier(mapped)).toBe(true);
    expect(rowIsEmailSendable(mapped)).toBe(false);
  });

  it("treats an office-phone-only row as a valid (non-email-sendable) contact intake", () => {
    const mapped = mapContactRow({ "Office Number": "+44 20 0000 0000" });
    expect(rowHasOutreachIdentifier(mapped)).toBe(true);
    expect(rowIsEmailSendable(mapped)).toBe(false);
  });

  it("treats a row with no outreach identifier as invalid intake", () => {
    const mapped = mapContactRow({
      Name: "No Identifier",
      Employer: "Ghost Inc",
      Location: "London",
    });
    expect(rowHasOutreachIdentifier(mapped)).toBe(false);
    expect(rowIsEmailSendable(mapped)).toBe(false);
  });
});
