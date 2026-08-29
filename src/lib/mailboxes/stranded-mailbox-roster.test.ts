import { describe, expect, it } from "vitest";

import {
  buildStrandedMailboxRoster,
  type StrandedMailboxRosterInput,
} from "./stranded-mailbox-roster";

const NOW = new Date("2026-08-29T07:00:00.000Z");

function row(
  overrides: Partial<StrandedMailboxRosterInput> = {},
): StrandedMailboxRosterInput {
  return {
    mailboxId: "mb-1",
    clientId: "c-1",
    clientName: "Protech Roofing",
    clientSlug: "protech-roofing",
    email: "hello@protech.example",
    provider: "MICROSOFT",
    connectionStatus: "CONNECTED",
    hasStoredCredential: true,
    isActive: true,
    workspaceRemovedAt: null,
    isSendingEnabled: true,
    pendingSince: new Date("2026-08-29T06:00:00.000Z"),
    lastSyncAt: null,
    ...overrides,
  };
}

/** The shape an abandoned Connect leaves behind. */
function stranded(
  overrides: Partial<StrandedMailboxRosterInput> = {},
): StrandedMailboxRosterInput {
  return row({
    connectionStatus: "PENDING_CONNECTION",
    hasStoredCredential: false,
    ...overrides,
  });
}

describe("the stranded-mailbox roster — what it counts", () => {
  it("counts a PENDING_CONNECTION row with no credential as unable to send", () => {
    const roster = buildStrandedMailboxRoster([stranded()], NOW);
    expect(roster.strandedCount).toBe(1);
    expect(roster.sendableCount).toBe(0);
    expect(roster.liveCount).toBe(1);
  });

  it("reports the headline the probe reports — how many of the live can send", () => {
    const roster = buildStrandedMailboxRoster(
      [row({ mailboxId: "a" }), row({ mailboxId: "b" }), stranded({ mailboxId: "c" })],
      NOW,
    );
    expect(roster.liveCount).toBe(3);
    expect(roster.sendableCount).toBe(2);
    expect(roster.strandedCount).toBe(1);
  });

  it("does NOT count an inactive or removed mailbox — it is not expected to send", () => {
    const roster = buildStrandedMailboxRoster(
      [
        stranded({ mailboxId: "a", isActive: false }),
        stranded({ mailboxId: "b", workspaceRemovedAt: new Date("2026-01-01") }),
      ],
      NOW,
    );
    expect(roster.strandedCount).toBe(0);
    expect(roster.liveCount).toBe(0);
  });

  it("does NOT count a CONNECTED mailbox that still holds its credential", () => {
    const roster = buildStrandedMailboxRoster([row()], NOW);
    expect(roster.strandedCount).toBe(0);
    expect(roster.sendableCount).toBe(1);
  });

  it("counts MICROSOFT rows, which the Google-only check can never see", () => {
    const roster = buildStrandedMailboxRoster(
      [stranded({ provider: "MICROSOFT" }), stranded({ mailboxId: "g", provider: "GOOGLE" })],
      NOW,
    );
    expect(roster.strandedCount).toBe(2);
    expect(roster.entries.map((e) => e.provider).sort()).toEqual(["GOOGLE", "MICROSOFT"]);
  });
});

describe("the stranded-mailbox roster — new versus long-standing", () => {
  it("calls a mailbox stranded inside the digest window NEW — somebody was just at the screen", () => {
    const roster = buildStrandedMailboxRoster(
      [stranded({ pendingSince: new Date("2026-08-29T02:00:00.000Z") })],
      NOW,
    );
    expect(roster.newlyStrandedCount).toBe(1);
  });

  it("does not call a sixty-day-old row new", () => {
    const roster = buildStrandedMailboxRoster(
      [stranded({ pendingSince: new Date("2026-06-23T07:00:00.000Z") })],
      NOW,
    );
    expect(roster.newlyStrandedCount).toBe(0);
    expect(roster.strandedCount).toBe(1);
  });

  it("treats an unknown pending date as long-standing, never as new", () => {
    // Guessing NEW on a missing date would put a subject line in front of Greg
    // claiming something changed last night when nothing is known to have.
    const roster = buildStrandedMailboxRoster([stranded({ pendingSince: null })], NOW);
    expect(roster.newlyStrandedCount).toBe(0);
    expect(roster.strandedCount).toBe(1);
  });
});

describe("the stranded-mailbox roster — how it reads", () => {
  it("puts the newest first, because that is the one still worth chasing", () => {
    const roster = buildStrandedMailboxRoster(
      [
        stranded({
          mailboxId: "old",
          email: "old@x.example",
          pendingSince: new Date("2026-06-23T07:00:00.000Z"),
        }),
        stranded({
          mailboxId: "new",
          email: "new@x.example",
          pendingSince: new Date("2026-08-29T02:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(roster.entries.map((e) => e.mailboxId)).toEqual(["new", "old"]);
  });

  it("says how long it has been off the air, in days a person can act on", () => {
    const roster = buildStrandedMailboxRoster(
      [stranded({ pendingSince: new Date("2026-06-23T07:00:00.000Z") })],
      NOW,
    );
    expect(roster.entries[0]?.label).toContain("67 days");
  });

  it("distinguishes a mailbox that was previously working from one never connected", () => {
    const roster = buildStrandedMailboxRoster(
      [
        stranded({ mailboxId: "worked", lastSyncAt: new Date("2026-06-24T07:00:00.000Z") }),
        stranded({ mailboxId: "never", lastSyncAt: null }),
      ],
      NOW,
    );
    const worked = roster.entries.find((e) => e.mailboxId === "worked");
    const never = roster.entries.find((e) => e.mailboxId === "never");
    expect(worked?.label).toContain("was working");
    expect(never?.label).toContain("never");
  });

  it("groups by client, because a client is who gets telephoned", () => {
    const roster = buildStrandedMailboxRoster(
      [
        stranded({ mailboxId: "a", clientId: "c-1", clientName: "Protech Roofing" }),
        stranded({ mailboxId: "b", clientId: "c-1", clientName: "Protech Roofing" }),
        stranded({ mailboxId: "c", clientId: "c-2", clientName: "Chevron Security" }),
      ],
      NOW,
    );
    expect(roster.strandedByClient).toHaveLength(2);
    // Looked up by name, not by position: with equal dates the tie-break is
    // alphabetical, and asserting a position would pin the tie-break rather
    // than the grouping this test is about.
    const protech = roster.strandedByClient.find((g) => g.clientName === "Protech Roofing");
    const chevron = roster.strandedByClient.find((g) => g.clientName === "Chevron Security");
    expect(protech?.entries.map((e) => e.mailboxId).sort()).toEqual(["a", "b"]);
    expect(chevron?.entries.map((e) => e.mailboxId)).toEqual(["c"]);
  });

  it("masks the address, because this output is pasted into logs and cycle notes", () => {
    const roster = buildStrandedMailboxRoster(
      [stranded({ email: "lucy@protech.example" })],
      NOW,
    );
    expect(roster.entries[0]?.maskedEmail).toBe("lu***@protech.example");
    expect(roster.entries[0]?.maskedEmail).not.toContain("lucy");
  });
});
