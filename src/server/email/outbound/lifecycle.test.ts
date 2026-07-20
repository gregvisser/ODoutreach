import { describe, expect, it } from "vitest";

import type { OutboundEmailStatus } from "@/generated/prisma/enums";

import {
  canApplyReplyMilestone,
  isSendPathTerminal,
  mapEventTypeToKind,
  planWebhookMutation,
  type WebhookMutationKind,
} from "./lifecycle";

const ALL_STATUSES: OutboundEmailStatus[] = [
  "PREPARING",
  "REQUESTED",
  "QUEUED",
  "PROCESSING",
  "BLOCKED_SUPPRESSION",
  "SENT",
  "FAILED",
  "BOUNCED",
  "DELIVERED",
  "REPLIED",
];

const TERMINAL: OutboundEmailStatus[] = ["BLOCKED_SUPPRESSION", "FAILED", "BOUNCED"];

const EVENT_AT = new Date("2026-03-01T12:00:00.000Z");

function plan(
  currentStatus: OutboundEmailStatus,
  kind: WebhookMutationKind,
  opts: { eventCreatedAt?: Date; lastProviderEventAt?: Date | null } = {},
) {
  return planWebhookMutation({
    currentStatus,
    kind,
    eventCreatedAt: opts.eventCreatedAt ?? EVENT_AT,
    lastProviderEventAt: opts.lastProviderEventAt ?? null,
  });
}

describe("isSendPathTerminal", () => {
  it.each(TERMINAL)("treats %s as terminal — no ESP send may be invoked", (status) => {
    expect(isSendPathTerminal(status)).toBe(true);
  });

  it.each(ALL_STATUSES.filter((s) => !TERMINAL.includes(s)))(
    "treats %s as non-terminal",
    (status) => {
      expect(isSendPathTerminal(status)).toBe(false);
    },
  );
});

describe("canApplyReplyMilestone", () => {
  it.each(TERMINAL)(
    "refuses to set REPLIED over %s — a reply must not erase bounce/failure truth",
    (status) => {
      expect(canApplyReplyMilestone(status)).toBe(false);
    },
  );

  it.each(ALL_STATUSES.filter((s) => !TERMINAL.includes(s)))(
    "allows the REPLIED milestone from %s",
    (status) => {
      expect(canApplyReplyMilestone(status)).toBe(true);
    },
  );
});

describe("planWebhookMutation — ordering guard", () => {
  it("skips an event older than the last applied provider event", () => {
    expect(
      plan("SENT", "delivered", {
        eventCreatedAt: new Date("2026-03-01T11:59:59.000Z"),
        lastProviderEventAt: new Date("2026-03-01T12:00:00.000Z"),
      }),
    ).toEqual({
      mode: "skip",
      reason: "older_than_last_applied_provider_event",
    });
  });

  it("still applies an event with a timestamp equal to the last applied one", () => {
    // Equal is not "older" — providers commonly emit same-second events, and
    // dropping them would silently lose the delivered signal.
    const at = new Date("2026-03-01T12:00:00.000Z");
    expect(
      plan("SENT", "delivered", { eventCreatedAt: at, lastProviderEventAt: at }).mode,
    ).toBe("apply_status");
  });

  it("applies a newer event", () => {
    expect(
      plan("SENT", "delivered", {
        eventCreatedAt: new Date("2026-03-01T12:00:01.000Z"),
        lastProviderEventAt: new Date("2026-03-01T12:00:00.000Z"),
      }).mode,
    ).toBe("apply_status");
  });

  it("applies when the row has no prior provider event", () => {
    expect(plan("SENT", "delivered", { lastProviderEventAt: null }).mode).toBe(
      "apply_status",
    );
  });

  it("guards ordering ahead of every event kind, including sent_ack", () => {
    const older = {
      eventCreatedAt: new Date("2026-03-01T10:00:00.000Z"),
      lastProviderEventAt: new Date("2026-03-01T12:00:00.000Z"),
    };
    for (const kind of [
      "delivered",
      "bounced",
      "failed",
      "complained",
      "delayed",
      "sent_ack",
      "other",
    ] as WebhookMutationKind[]) {
      expect(plan("SENT", kind, older).mode).toBe("skip");
    }
  });
});

describe("planWebhookMutation — delivered", () => {
  it.each(["SENT", "PROCESSING", "DELIVERED"] as OutboundEmailStatus[])(
    "applies delivered from %s",
    (status) => {
      expect(plan(status, "delivered")).toEqual({
        mode: "apply_status",
        reason: "delivered_after_send",
      });
    },
  );

  it.each(["QUEUED", "REQUESTED", "PREPARING"] as OutboundEmailStatus[])(
    "skips delivered from %s — the send was never confirmed",
    (status) => {
      expect(plan(status, "delivered")).toEqual({
        mode: "skip",
        reason: "delivered_before_send_confirmed",
      });
    },
  );

  it("records delivered as metadata only when the row is already REPLIED", () => {
    // A late delivered backfill must not downgrade the REPLIED milestone.
    expect(plan("REPLIED", "delivered")).toEqual({
      mode: "metadata_only",
      reason: "delivered_backfill_while_replied",
    });
  });

  it.each(TERMINAL)("skips delivered when the row is %s", (status) => {
    expect(plan(status, "delivered")).toEqual({
      mode: "skip",
      reason: "terminal_status_blocks_delivered",
    });
  });
});

describe("planWebhookMutation — bounced", () => {
  it.each(["SENT", "DELIVERED", "PROCESSING"] as OutboundEmailStatus[])(
    "applies a bounce from %s",
    (status) => {
      expect(plan(status, "bounced")).toEqual({ mode: "apply_status", reason: "bounce" });
    },
  );

  it("keeps the REPLIED milestone over an out-of-order bounce", () => {
    expect(plan("REPLIED", "bounced")).toEqual({
      mode: "skip",
      reason: "keep_replied_milestone_over_out_of_order_bounce",
    });
  });

  it.each(TERMINAL)("refreshes metadata only when already %s", (status) => {
    expect(plan(status, "bounced")).toEqual({
      mode: "metadata_only",
      reason: "terminal_refresh_only",
    });
  });

  it.each(["QUEUED", "REQUESTED", "PREPARING"] as OutboundEmailStatus[])(
    "skips a bounce from %s",
    (status) => {
      expect(plan(status, "bounced")).toEqual({
        mode: "skip",
        reason: "bounce_not_applicable",
      });
    },
  );
});

describe("planWebhookMutation — failed and complained", () => {
  const kinds: WebhookMutationKind[] = ["failed", "complained"];

  it.each(kinds)("applies %s from SENT", (kind) => {
    expect(plan("SENT", kind)).toEqual({
      mode: "apply_status",
      reason: "provider_failure",
    });
  });

  it.each(kinds)("applies %s from DELIVERED and PROCESSING", (kind) => {
    expect(plan("DELIVERED", kind).mode).toBe("apply_status");
    expect(plan("PROCESSING", kind).mode).toBe("apply_status");
  });

  it.each(kinds)("keeps REPLIED over a provider %s", (kind) => {
    expect(plan("REPLIED", kind)).toEqual({
      mode: "skip",
      reason: "keep_replied_over_provider_failed",
    });
  });

  it.each(kinds)("refreshes metadata only when already terminal (%s)", (kind) => {
    for (const status of TERMINAL) {
      expect(plan(status, kind)).toEqual({
        mode: "metadata_only",
        reason: "terminal_refresh_only",
      });
    }
  });

  it.each(kinds)("skips %s from a pre-send status", (kind) => {
    expect(plan("QUEUED", kind)).toEqual({
      mode: "skip",
      reason: "failed_event_not_applicable",
    });
  });
});

describe("planWebhookMutation — delayed, sent_ack and unknown", () => {
  it("treats a delay as a deferred signal on a live row", () => {
    expect(plan("SENT", "delayed")).toEqual({
      mode: "metadata_only",
      reason: "deferred_signal",
    });
  });

  it.each(TERMINAL)("skips a delay when the row is %s", (status) => {
    expect(plan(status, "delayed")).toEqual({ mode: "skip", reason: "terminal" });
  });

  it("never changes status on a sent acknowledgement", () => {
    for (const status of ALL_STATUSES) {
      expect(plan(status, "sent_ack")).toEqual({
        mode: "metadata_only",
        reason: "sent_echo",
      });
    }
  });

  it("records an unrecognised signal without changing status", () => {
    expect(plan("SENT", "other")).toEqual({
      mode: "metadata_only",
      reason: "generic_provider_signal",
    });
  });

  it("never returns apply_status for a terminal row on any kind", () => {
    // The core invariant: terminal truth is never overwritten by a webhook.
    for (const status of TERMINAL) {
      for (const kind of [
        "delivered",
        "bounced",
        "failed",
        "complained",
        "delayed",
        "other",
      ] as WebhookMutationKind[]) {
        expect(plan(status, kind).mode).not.toBe("apply_status");
      }
    }
  });
});

describe("mapEventTypeToKind", () => {
  it.each([
    ["email.delivered", "delivered"],
    ["email.bounced", "bounced"],
    ["email.failed", "failed"],
    ["email.complained", "complained"],
    ["email.sent", "sent_ack"],
    ["email.delivery_delayed", "delayed"],
  ] as const)("maps %s to %s", (eventType, expected) => {
    expect(mapEventTypeToKind(eventType)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(mapEventTypeToKind("EMAIL.DELIVERED")).toBe("delivered");
    expect(mapEventTypeToKind("Email.Bounced")).toBe("bounced");
  });

  it("checks delivery_delayed before delivered", () => {
    // "email.delivery_delayed" must not be captured by the `.delivered` rule.
    expect(mapEventTypeToKind("some.delivery_delayed")).toBe("delayed");
  });

  it("matches provider-prefixed suffixes for delivered", () => {
    expect(mapEventTypeToKind("postmark.delivered")).toBe("delivered");
  });

  it("matches bounced anywhere in the event type", () => {
    expect(mapEventTypeToKind("message.hard_bounced.v2")).toBe("bounced");
  });

  it("falls back to other for unknown event types", () => {
    expect(mapEventTypeToKind("email.opened")).toBe("other");
    expect(mapEventTypeToKind("")).toBe("other");
  });
});
