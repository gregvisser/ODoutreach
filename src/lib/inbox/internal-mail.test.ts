import { describe, expect, it } from "vitest";

import {
  deriveInternalDomains,
  emailDomain,
  isInternalMail,
} from "./internal-mail";

describe("emailDomain", () => {
  it("extracts the lowercased domain", () => {
    expect(emailDomain("Lucy.G@OpensDoors.co.uk")).toBe("opensdoors.co.uk");
  });
  it("returns null for non-addresses", () => {
    expect(emailDomain("not-an-email")).toBeNull();
    expect(emailDomain(null)).toBeNull();
    expect(emailDomain(undefined)).toBeNull();
    expect(emailDomain("trailing@")).toBeNull();
  });
});

describe("deriveInternalDomains", () => {
  it("dedupes and lowercases the workspace's mailbox domains", () => {
    expect(
      deriveInternalDomains([
        "sam.p@trainhugger.com",
        "hello@TrainHugger.com",
        null,
        "bad",
      ]),
    ).toEqual(["trainhugger.com"]);
  });
});

describe("isInternalMail", () => {
  const opensdoors = ["opensdoors.co.uk"];
  const trainhugger = ["trainhugger.com"];

  it("DROPS the two real internal OpensDoors threads (both ends internal)", () => {
    expect(
      isInternalMail({
        fromEmail: "lucysg@opensdoors.co.uk",
        toEmail: "james@opensdoors.co.uk",
        internalDomains: opensdoors,
      }),
    ).toBe(true);
    expect(
      isInternalMail({
        fromEmail: "lucysg@opensdoors.co.uk",
        toEmail: "sarah-jane@opensdoors.co.uk",
        internalDomains: opensdoors,
      }),
    ).toBe(true);
  });

  it("KEEPS the real external prospect reply (alex.ullmann -> trainhugger)", () => {
    expect(
      isInternalMail({
        fromEmail: "alex.ullmann@pxc.co.uk",
        toEmail: "sam.p@trainhugger.com",
        internalDomains: trainhugger,
      }),
    ).toBe(false);
  });

  it("keeps a message when only the recipient is internal (normal inbound)", () => {
    expect(
      isInternalMail({
        fromEmail: "prospect@external.com",
        toEmail: "sam.p@trainhugger.com",
        internalDomains: trainhugger,
      }),
    ).toBe(false);
  });

  it("keeps a message when the recipient is unknown (cannot confirm both internal)", () => {
    expect(
      isInternalMail({
        fromEmail: "lucysg@opensdoors.co.uk",
        toEmail: null,
        internalDomains: opensdoors,
      }),
    ).toBe(false);
  });

  it("is case-insensitive on both the address and the domain list", () => {
    expect(
      isInternalMail({
        fromEmail: "Lucy.G@OPENSDOORS.co.uk",
        toEmail: "James@opensdoors.CO.UK",
        internalDomains: ["OpensDoors.co.uk"],
      }),
    ).toBe(true);
  });

  it("returns false when there are no internal domains", () => {
    expect(
      isInternalMail({
        fromEmail: "a@opensdoors.co.uk",
        toEmail: "b@opensdoors.co.uk",
        internalDomains: [],
      }),
    ).toBe(false);
  });
});
