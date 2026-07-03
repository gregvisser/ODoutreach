import { afterEach, describe, expect, it } from "vitest";

import {
  clientLinkDomainAligned,
  deriveGoLinkDomain,
  isClientLinkDomainReady,
  isGoDomainAllowedForClient,
  resolveClientLinkBaseUrl,
} from "./client-link-domain";
import { evaluateSendGovernance } from "./client-send-governance";

const FLAG = "OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN";
const original = process.env[FLAG];
afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
});

const ready = {
  outreachLinkDomain: "go.paratus365.com",
  outreachLinkDomainVerifiedAt: new Date("2026-07-03T00:00:00Z"),
};
const notVerified = {
  outreachLinkDomain: "go.paratus365.com",
  outreachLinkDomainVerifiedAt: null,
};
const unset = { outreachLinkDomain: null, outreachLinkDomainVerifiedAt: null };

describe("deriveGoLinkDomain", () => {
  it("prefixes go. to a bare domain", () => {
    expect(deriveGoLinkDomain("paratus365.com")).toBe("go.paratus365.com");
  });
  it("derives from an email address", () => {
    expect(deriveGoLinkDomain("Sam@Paratus365.com")).toBe("go.paratus365.com");
  });
  it("does not double-prefix", () => {
    expect(deriveGoLinkDomain("go.rtp-ltd.co.uk")).toBe("go.rtp-ltd.co.uk");
  });
  it("returns null for junk", () => {
    expect(deriveGoLinkDomain("notadomain")).toBeNull();
    expect(deriveGoLinkDomain("")).toBeNull();
  });
});

describe("readiness + base URL", () => {
  it("is ready only when set AND verified", () => {
    expect(isClientLinkDomainReady(ready)).toBe(true);
    expect(isClientLinkDomainReady(notVerified)).toBe(false);
    expect(isClientLinkDomainReady(unset)).toBe(false);
  });
  it("builds the https base URL only when ready", () => {
    expect(resolveClientLinkBaseUrl(ready)).toBe("https://go.paratus365.com");
    expect(resolveClientLinkBaseUrl(notVerified)).toBeNull();
    expect(resolveClientLinkBaseUrl(unset)).toBeNull();
  });
});

describe("isGoDomainAllowedForClient", () => {
  const mailboxes = ["sam@paratus365.com", "info@Paratus365.com"];
  it("accepts the go. subdomain of a client's sending domain", () => {
    expect(isGoDomainAllowedForClient("go.paratus365.com", mailboxes)).toBe(true);
  });
  it("is case-insensitive on the requested domain", () => {
    expect(isGoDomainAllowedForClient("GO.Paratus365.com", mailboxes)).toBe(true);
  });
  it("accepts when the mailbox list is raw domains, not emails", () => {
    expect(isGoDomainAllowedForClient("go.rtp-ltd.co.uk", ["rtp-ltd.co.uk"])).toBe(
      true,
    );
  });
  it("rejects a domain not derived from any mailbox", () => {
    expect(isGoDomainAllowedForClient("go.evil.com", mailboxes)).toBe(false);
  });
  it("rejects the bare domain (must be the go. subdomain)", () => {
    expect(isGoDomainAllowedForClient("paratus365.com", mailboxes)).toBe(false);
  });
  it("rejects empty / no mailboxes", () => {
    expect(isGoDomainAllowedForClient("", mailboxes)).toBe(false);
    expect(isGoDomainAllowedForClient("go.paratus365.com", [])).toBe(false);
  });
});

describe("clientLinkDomainAligned (hard-rule gate value)", () => {
  it("is always true when the rule is not enforced (default)", () => {
    delete process.env[FLAG];
    expect(clientLinkDomainAligned(unset)).toBe(true);
    expect(clientLinkDomainAligned(notVerified)).toBe(true);
  });
  it("requires a ready link domain when enforced", () => {
    process.env[FLAG] = "on";
    expect(clientLinkDomainAligned(ready)).toBe(true);
    expect(clientLinkDomainAligned(notVerified)).toBe(false);
    expect(clientLinkDomainAligned(unset)).toBe(false);
  });
});

describe("evaluateSendGovernance hard rule", () => {
  const liveClient = {
    status: "ACTIVE",
    launchApprovedAt: new Date("2026-06-01T00:00:00Z"),
    launchApprovalMode: "FULL_LIVE",
  };

  it("blocks a real-prospect send when links are not aligned", () => {
    const d = evaluateSendGovernance({
      client: liveClient,
      recipientAllowlisted: false,
      sendKind: "SEQUENCE_INTRODUCTION",
      oneClickUnsubscribeReady: true,
      linkDomainAligned: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.mode).toBe("blocked_link_domain_not_aligned");
  });

  it("allows a real-prospect send when links are aligned", () => {
    const d = evaluateSendGovernance({
      client: liveClient,
      recipientAllowlisted: false,
      sendKind: "SEQUENCE_INTRODUCTION",
      oneClickUnsubscribeReady: true,
      linkDomainAligned: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.mode).toBe("live_prospect");
  });

  it("never blocks an allowlisted governed test, even when unaligned", () => {
    const d = evaluateSendGovernance({
      client: liveClient,
      recipientAllowlisted: true,
      sendKind: "GOVERNED_TEST",
      oneClickUnsubscribeReady: true,
      linkDomainAligned: false,
    });
    expect(d.allowed).toBe(true);
  });
});
