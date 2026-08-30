import { describe, expect, it } from "vitest";

import { canonicalizeEmailForMatching, suppressionDomainCandidates } from "./normalize";

describe("canonicalizeEmailForMatching", () => {
  it("strips a plus-tag from the local part", () => {
    expect(canonicalizeEmailForMatching("greg.visser64+cycle109@gmail.com")).toBe(
      "greg.visser64@gmail.com",
    );
  });

  it("treats the bare address and its plus-alias as identical", () => {
    expect(canonicalizeEmailForMatching("user@example.com")).toBe(
      canonicalizeEmailForMatching("user+anything@example.com"),
    );
  });

  it("normalizes case and whitespace first", () => {
    expect(canonicalizeEmailForMatching("  USER+Tag@Example.COM  ")).toBe("user@example.com");
  });

  it("leaves an address with no plus tag unchanged (besides normalizeEmail)", () => {
    expect(canonicalizeEmailForMatching("user@example.com")).toBe("user@example.com");
  });

  it("does not touch anything after the @ — no accidental domain stripping", () => {
    expect(canonicalizeEmailForMatching("user@sub+domain.example.com")).toBe(
      "user@sub+domain.example.com",
    );
  });
});

describe("suppressionDomainCandidates", () => {
  it("returns the apex itself for a two-label domain", () => {
    expect(suppressionDomainCandidates("bt.com")).toEqual(["bt.com"]);
  });

  it("walks up to each parent, most specific first", () => {
    expect(suppressionDomainCandidates("mail.corp.bt.com")).toEqual([
      "mail.corp.bt.com",
      "corp.bt.com",
      "bt.com",
    ]);
  });

  it("never yields a bare public suffix", () => {
    expect(suppressionDomainCandidates("newsletter.bt.com")).not.toContain("com");
  });

  it("does not make a lookalike a candidate for the suppressed apex", () => {
    // The bug this guards: `endsWith("bt.com")` would wrongly match notbt.com.
    expect(suppressionDomainCandidates("notbt.com")).toEqual(["notbt.com"]);
  });

  it("does not yield the suppressed domain for a prefix lookalike", () => {
    // bt.com.evil.net is registered under evil.net and is NOT BT.
    expect(suppressionDomainCandidates("bt.com.evil.net")).not.toContain("bt.com");
  });

  it("normalizes protocol, www, path, case and trailing dot first", () => {
    expect(suppressionDomainCandidates("https://WWW.News.BT.com/path/")).toEqual([
      "news.bt.com",
      "bt.com",
    ]);
  });

  it("returns nothing for junk", () => {
    expect(suppressionDomainCandidates("")).toEqual([]);
    expect(suppressionDomainCandidates("not a domain")).toEqual([]);
    expect(suppressionDomainCandidates("localhost")).toEqual([]);
  });
});
