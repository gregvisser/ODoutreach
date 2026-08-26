import { afterEach, describe, expect, it, vi } from "vitest";

/** internal-domains loads prisma; mock it so this suite needs no DATABASE_URL. */
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  internalDomainsFromMailboxEmails,
  isInternalMailFilterEnabled,
} from "./internal-domains";

const ORIGINAL = process.env.INBOUND_INTERNAL_MAIL_FILTER;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INBOUND_INTERNAL_MAIL_FILTER;
  else process.env.INBOUND_INTERNAL_MAIL_FILTER = ORIGINAL;
});

/**
 * Queue item 3 — `loadClientWorkspaceBundle` already holds every mailbox row for
 * the client, so it derives the internal-mail domains from those instead of
 * re-querying ClientMailboxIdentity. The risk in that shortcut is routing round
 * the F4 kill-switch along with the query, so that is what these assert.
 */
describe("internalDomainsFromMailboxEmails", () => {
  it("derives the workspace's own domains from its mailbox addresses", () => {
    process.env.INBOUND_INTERNAL_MAIL_FILTER = "on";
    expect(
      internalDomainsFromMailboxEmails([
        "lucy@opensdoors.co.uk",
        "sam@opensdoors.co.uk",
        "greg@bidlow.co.uk",
      ]).sort(),
    ).toEqual(["bidlow.co.uk", "opensdoors.co.uk"]);
  });

  it("honours the F4 kill-switch — off means filter nothing", () => {
    process.env.INBOUND_INTERNAL_MAIL_FILTER = "off";
    expect(isInternalMailFilterEnabled()).toBe(false);
    expect(internalDomainsFromMailboxEmails(["lucy@opensdoors.co.uk"])).toEqual([]);
  });

  it("is empty for a workspace with no mailboxes", () => {
    process.env.INBOUND_INTERNAL_MAIL_FILTER = "on";
    expect(internalDomainsFromMailboxEmails([])).toEqual([]);
  });

  it("gives the same answer the querying variant would, for the same addresses", () => {
    // resolveInternalDomainsForClient runs `deriveInternalDomains` over exactly
    // `where: { clientId }` — every mailbox row, unfiltered. The bundle passes
    // `client.mailboxIdentities`, which is that same unfiltered set, so the two
    // must agree. This pins the contract that makes skipping the query safe.
    process.env.INBOUND_INTERNAL_MAIL_FILTER = "on";
    const emails = ["a@one.example", "b@two.example", "c@one.example"];
    expect(internalDomainsFromMailboxEmails(emails).sort()).toEqual([
      "one.example",
      "two.example",
    ]);
  });
});
