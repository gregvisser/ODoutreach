import { describe, expect, it } from "vitest";

import { suppressionDomainCandidates } from "./normalize";

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
