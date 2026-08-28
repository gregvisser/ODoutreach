import { describe, expect, it } from "vitest";

import { buildGoogleReconnectRoster, type GoogleReconnectRosterInput } from "./google-reconnect-roster";

const NOW = new Date("2026-09-01T08:00:00.000Z");

/** A mailbox whose consent happened `daysAgo` before NOW. */
function mailbox(
  overrides: Partial<GoogleReconnectRosterInput> & { email: string; daysAgo?: number },
): GoogleReconnectRosterInput {
  const { daysAgo, ...rest } = overrides;
  return {
    mailboxId: `mb-${overrides.email}`,
    clientId: "client-a",
    clientName: "Train Hugger",
    clientSlug: "train-hugger",
    provider: "GOOGLE",
    connectionStatus: "CONNECTED",
    connectedAt: daysAgo === undefined ? null : new Date(NOW.getTime() - daysAgo * 86_400_000),
    ...rest,
  };
}

describe("buildGoogleReconnectRoster — what it includes", () => {
  it("drops Microsoft mailboxes entirely, so the screen is the Google chore only", () => {
    const roster = buildGoogleReconnectRoster(
      [
        mailbox({ email: "a@x.com", daysAgo: 1 }),
        mailbox({ email: "b@x.com", daysAgo: 1, provider: "MICROSOFT" }),
      ],
      NOW,
    );
    expect(roster.entries.map((e) => e.email)).toEqual(["a@x.com"]);
  });

  it("keeps a Google mailbox that is not connected, because an abandoned Connect is the same chore", () => {
    const roster = buildGoogleReconnectRoster(
      [mailbox({ email: "stranded@x.com", connectionStatus: "PENDING_CONNECTION" })],
      NOW,
    );
    expect(roster.entries).toHaveLength(1);
    expect(roster.entries[0]?.countdown).toBeNull();
    expect(roster.entries[0]?.needsAttention).toBe(true);
    expect(roster.entries[0]?.label).toContain("Not connected");
  });

  it("treats a connected, in-date mailbox as needing nothing", () => {
    const roster = buildGoogleReconnectRoster([mailbox({ email: "fresh@x.com", daysAgo: 1 })], NOW);
    expect(roster.entries[0]?.needsAttention).toBe(false);
    expect(roster.dueSoon).toHaveLength(0);
  });
});

describe("buildGoogleReconnectRoster — the order the chore is worked in", () => {
  it("puts the most urgent first: overdue, then fewest days left, then the rest", () => {
    const roster = buildGoogleReconnectRoster(
      [
        mailbox({ email: "ok@x.com", daysAgo: 0 }),
        mailbox({ email: "overdue@x.com", daysAgo: 9 }),
        mailbox({ email: "due-tomorrow@x.com", daysAgo: 6 }),
        mailbox({ email: "due-in-two@x.com", daysAgo: 5 }),
        mailbox({ email: "never-connected@x.com", connectionStatus: "DRAFT" }),
      ],
      NOW,
    );
    expect(roster.entries.map((e) => e.email)).toEqual([
      "overdue@x.com",
      "due-tomorrow@x.com",
      "due-in-two@x.com",
      "ok@x.com",
      "never-connected@x.com",
    ]);
  });

  it("breaks a tie by client then address, so the list does not reshuffle between loads", () => {
    const roster = buildGoogleReconnectRoster(
      [
        mailbox({ email: "z@x.com", daysAgo: 5, clientName: "Alpha" }),
        mailbox({ email: "a@x.com", daysAgo: 5, clientName: "Alpha" }),
        mailbox({ email: "m@x.com", daysAgo: 5, clientName: "Beta" }),
      ],
      NOW,
    );
    expect(roster.entries.map((e) => e.email)).toEqual(["a@x.com", "z@x.com", "m@x.com"]);
  });
});

describe("buildGoogleReconnectRoster — what the day-five alert is given", () => {
  it("lists only the mailboxes that need acting on", () => {
    const roster = buildGoogleReconnectRoster(
      [
        mailbox({ email: "ok@x.com", daysAgo: 2 }),
        mailbox({ email: "due@x.com", daysAgo: 5 }),
        mailbox({ email: "overdue@x.com", daysAgo: 8 }),
      ],
      NOW,
    );
    expect(roster.dueSoon.map((e) => e.email)).toEqual(["overdue@x.com", "due@x.com"]);
  });

  it("counts the roster so the alert can say how big the chore is", () => {
    const roster = buildGoogleReconnectRoster(
      [
        mailbox({ email: "ok@x.com", daysAgo: 2 }),
        mailbox({ email: "due@x.com", daysAgo: 6 }),
        mailbox({ email: "overdue@x.com", daysAgo: 8 }),
        mailbox({ email: "stranded@x.com", connectionStatus: "PENDING_CONNECTION" }),
      ],
      NOW,
    );
    expect(roster.totalGoogleMailboxes).toBe(4);
    expect(roster.overdueCount).toBe(1);
    expect(roster.dueSoonCount).toBe(3);
  });

  it("groups the due mailboxes by client, because that is who gets telephoned", () => {
    const roster = buildGoogleReconnectRoster(
      [
        mailbox({ email: "a@th.com", daysAgo: 6, clientName: "Train Hugger" }),
        mailbox({ email: "b@th.com", daysAgo: 8, clientName: "Train Hugger" }),
        mailbox({ email: "c@od.com", daysAgo: 5, clientName: "OpensDoors", clientId: "client-b" }),
      ],
      NOW,
    );
    expect(roster.dueSoonByClient.map((g) => ({ client: g.clientName, n: g.entries.length }))).toEqual([
      { client: "Train Hugger", n: 2 },
      { client: "OpensDoors", n: 1 },
    ]);
  });

  it("reports an empty roster as nothing due rather than as an error", () => {
    const roster = buildGoogleReconnectRoster([], NOW);
    expect(roster.entries).toEqual([]);
    expect(roster.dueSoon).toEqual([]);
    expect(roster.totalGoogleMailboxes).toBe(0);
    expect(roster.dueSoonByClient).toEqual([]);
  });
});
