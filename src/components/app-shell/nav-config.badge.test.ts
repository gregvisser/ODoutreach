import { describe, expect, it } from "vitest";

import { buildMainNav, mainNav } from "./nav-config";

/**
 * Row 155 (raised by row 136, cycle 197, finding 2): the sidebar's "Google
 * logins" entry was a static label with no badge or count, so nobody but the
 * digest's one recipient (Greg) had any ambient reason to open the page.
 * `buildMainNav` is the pure, unit-testable seam between a real DB count and
 * the static `mainNav` shape the PR #139 audit already locks down.
 */
describe("buildMainNav — Google logins attention badge", () => {
  it("renders a non-zero count on the Google logins entry when mailboxes need attention", () => {
    const nav = buildMainNav(3);
    const entry = nav.find((item) => item.href === "/google-reconnects");
    expect(entry?.badge).toBe(3);
  });

  it("renders nothing when no mailbox needs attention", () => {
    const nav = buildMainNav(0);
    const entry = nav.find((item) => item.href === "/google-reconnects");
    expect(entry?.badge).toBeUndefined();
  });

  it("never touches badges on any other entry", () => {
    const nav = buildMainNav(5);
    for (const item of nav) {
      if (item.href !== "/google-reconnects") {
        expect(item.badge).toBeUndefined();
      }
    }
  });

  it("does not mutate the shared static mainNav array", () => {
    buildMainNav(7);
    const entry = mainNav.find((item) => item.href === "/google-reconnects");
    expect(entry?.badge).toBeUndefined();
  });
});
