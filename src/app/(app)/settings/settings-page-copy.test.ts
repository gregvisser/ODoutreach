import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #139 — Settings page is staff-ready.
 *
 * Each section must have a real purpose. No placeholder/dev copy. No "TODO"
 * stubs. No raw enum strings. The Settings-vs-per-client boundary must be
 * spelled out so staff don't go looking for Mailboxes / Brief / Lists here.
 */

const PAGE_PATH = join(process.cwd(), "src/app/(app)/settings/page.tsx");
const pageSource = readFileSync(PAGE_PATH, "utf8");

const FORBIDDEN_PLACEHOLDER_PHRASES = [
  "TODO",
  "Coming soon",
  "Lorem ipsum",
  "Placeholder",
  "WIP",
  "Not implemented",
  "FIXME",
  // Dev jargon
  "OAuth flow",
  "Tenant ID",
  "Service account JSON",
] as const;

describe("Settings page copy (PR #139)", () => {
  it("declares the Settings vs per-client boundary up front", () => {
    expect(pageSource).toContain("Per-client setup lives inside each client workspace");
    expect(pageSource).toContain("Where to change what");
    expect(pageSource).toContain("Inside each client");
  });

  it("does not contain placeholder / dev / TODO copy", () => {
    for (const phrase of FORBIDDEN_PLACEHOLDER_PHRASES) {
      expect(pageSource).not.toContain(phrase);
    }
  });

  it("renders every real section the audit confirmed", () => {
    const REQUIRED_SECTIONS = [
      "Branding",
      "Team access",
      "Sign-in and security",
      "Sending and compliance",
      "Integrations",
    ] as const;
    for (const heading of REQUIRED_SECTIONS) {
      expect(pageSource).toContain(heading);
    }
  });

  it("gates Staff and roles to admins (server-side)", () => {
    expect(pageSource).toMatch(/staff\.role === "ADMIN"/);
  });

  it("links to /settings/branding and /settings/staff-access", () => {
    expect(pageSource).toContain('href="/settings/branding"');
    expect(pageSource).toContain('href="/settings/staff-access"');
  });

  it("reads the post-PR-138 client subnav names in the cross-reference", () => {
    expect(pageSource).toContain("Lists");
    expect(pageSource).toContain("Do-not-contact");
  });
});
