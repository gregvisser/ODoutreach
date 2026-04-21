import { describe, expect, it } from "vitest";

import {
  buildClientTimeline,
  classifyImportBatchStatus,
  classifyOutboundStatus,
  DEFAULT_TIMELINE_LIMIT,
  eventTypeLabel,
  severityLabel,
  UNTRACKED_EVENT_TYPES,
  type TimelineEvent,
  type TimelineEventType,
} from "./client-activity-timeline";

function evt(
  id: string,
  occurredAt: Date,
  type: TimelineEventType,
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    id,
    occurredAt,
    type,
    title: `${type}-${id}`,
    severity: "info",
    sourceModel: "Test",
    ...overrides,
  };
}

describe("buildClientTimeline", () => {
  it("returns an empty summary when no events are provided", () => {
    const result = buildClientTimeline([]);
    expect(result.events).toEqual([]);
    expect(result.capped).toBe(false);
    expect(result.summary.totalEvents).toBe(0);
    expect(result.summary.latestAtIso).toBeNull();
    expect(result.summary.warnings).toBe(0);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.byType).toEqual({});
  });

  it("sorts events by occurredAt descending and stable-breaks ties by id", () => {
    const t = new Date("2026-04-20T12:00:00Z");
    const a = evt("a", t, "send");
    const b = evt("b", t, "reply");
    const c = evt("c", new Date("2026-04-20T12:00:01Z"), "send");
    const result = buildClientTimeline([a, b, c]);
    expect(result.events.map((e) => e.id)).toEqual(["c", "b", "a"]);
    expect(result.summary.latestAtIso).toBe("2026-04-20T12:00:01.000Z");
  });

  it("drops events with invalid occurredAt instead of returning NaN-sorted garbage", () => {
    const good = evt("good", new Date("2026-04-20T00:00:00Z"), "send");
    const bad = evt("bad", new Date("not a date"), "send");
    const result = buildClientTimeline([bad, good]);
    expect(result.events.map((e) => e.id)).toEqual(["good"]);
    expect(result.summary.totalEvents).toBe(1);
  });

  it("caps the timeline at the provided limit and marks capped=true", () => {
    const events: TimelineEvent[] = [];
    for (let i = 0; i < 5; i += 1) {
      events.push(
        evt(
          String(i).padStart(3, "0"),
          new Date(Date.parse("2026-04-20T00:00:00Z") + i * 1000),
          "send",
        ),
      );
    }
    const result = buildClientTimeline(events, 3);
    expect(result.events).toHaveLength(3);
    expect(result.capped).toBe(true);
    // Top 3 newest (ids 4, 3, 2) after desc sort
    expect(result.events.map((e) => e.id)).toEqual(["004", "003", "002"]);
  });

  it("defaults limit to DEFAULT_TIMELINE_LIMIT (100)", () => {
    expect(DEFAULT_TIMELINE_LIMIT).toBe(100);
    const events: TimelineEvent[] = [];
    for (let i = 0; i < 120; i += 1) {
      events.push(
        evt(
          String(i).padStart(3, "0"),
          new Date(Date.parse("2026-04-20T00:00:00Z") + i * 1000),
          "send",
        ),
      );
    }
    const result = buildClientTimeline(events);
    expect(result.events).toHaveLength(100);
    expect(result.capped).toBe(true);
  });

  it("aggregates byType counts and warning/error totals", () => {
    const t = new Date("2026-04-20T00:00:00Z");
    const events = [
      evt("a", t, "send", { severity: "success" }),
      evt("b", new Date(t.getTime() + 1000), "bounce", {
        severity: "warning",
      }),
      evt("c", new Date(t.getTime() + 2000), "error", { severity: "error" }),
      evt("d", new Date(t.getTime() + 3000), "send", { severity: "info" }),
    ];
    const result = buildClientTimeline(events);
    expect(result.summary.totalEvents).toBe(4);
    expect(result.summary.byType.send).toBe(2);
    expect(result.summary.byType.bounce).toBe(1);
    expect(result.summary.byType.error).toBe(1);
    expect(result.summary.warnings).toBe(1);
    expect(result.summary.errors).toBe(1);
  });

  it("clamps invalid/negative limits to a safe minimum of 1", () => {
    const t = new Date("2026-04-20T00:00:00Z");
    const events = [
      evt("a", t, "send"),
      evt("b", new Date(t.getTime() + 1000), "send"),
    ];
    const result = buildClientTimeline(events, -5);
    expect(result.events).toHaveLength(1);
    expect(result.capped).toBe(true);
  });
});

describe("eventTypeLabel and severityLabel", () => {
  it("returns a non-empty label for every event type", () => {
    const types: TimelineEventType[] = [
      "send",
      "reply",
      "bounce",
      "error",
      "inbound_message",
      "csv_import",
      "rocketreach_import",
      "contact_list",
      "list_membership",
      "suppression_sync",
      "mailbox_oauth",
      "template",
      "sequence",
      "enrollment",
      "audit",
    ];
    for (const t of types) {
      expect(eventTypeLabel(t).length).toBeGreaterThan(0);
    }
  });

  it("returns a non-empty label for every severity", () => {
    for (const s of ["info", "success", "warning", "error"] as const) {
      expect(severityLabel(s).length).toBeGreaterThan(0);
    }
  });
});

describe("classifyOutboundStatus", () => {
  it("maps SENT/DELIVERED to send / success", () => {
    expect(classifyOutboundStatus("SENT")).toEqual({
      type: "send",
      severity: "success",
    });
    expect(classifyOutboundStatus("DELIVERED")).toEqual({
      type: "send",
      severity: "success",
    });
  });

  it("maps BOUNCED to bounce / warning", () => {
    expect(classifyOutboundStatus("BOUNCED")).toEqual({
      type: "bounce",
      severity: "warning",
    });
  });

  it("maps FAILED to error / error", () => {
    expect(classifyOutboundStatus("FAILED")).toEqual({
      type: "error",
      severity: "error",
    });
  });

  it("maps BLOCKED_SUPPRESSION to send / warning", () => {
    expect(classifyOutboundStatus("BLOCKED_SUPPRESSION")).toEqual({
      type: "send",
      severity: "warning",
    });
  });

  it("maps REPLIED to send / success", () => {
    expect(classifyOutboundStatus("REPLIED")).toEqual({
      type: "send",
      severity: "success",
    });
  });

  it("maps PREPARING/REQUESTED/QUEUED/PROCESSING/unknown statuses to send / info", () => {
    for (const s of ["PREPARING", "REQUESTED", "QUEUED", "PROCESSING", "NEW_ESP_STATE"]) {
      expect(classifyOutboundStatus(s)).toEqual({
        type: "send",
        severity: "info",
      });
    }
  });
});

describe("classifyImportBatchStatus", () => {
  it("maps COMPLETED to success, FAILED to error, and pending/processing to info", () => {
    expect(classifyImportBatchStatus("COMPLETED")).toBe("success");
    expect(classifyImportBatchStatus("FAILED")).toBe("error");
    expect(classifyImportBatchStatus("PENDING")).toBe("info");
    expect(classifyImportBatchStatus("PROCESSING")).toBe("info");
    expect(classifyImportBatchStatus("SOMETHING_ELSE")).toBe("info");
  });
});

describe("UNTRACKED_EVENT_TYPES", () => {
  it("explicitly marks deferred event types so the UI can advise the operator", () => {
    expect(UNTRACKED_EVENT_TYPES).toContain("rocketreach_import");
    expect(UNTRACKED_EVENT_TYPES).toContain("suppression_sync");
    expect(UNTRACKED_EVENT_TYPES).toContain("list_membership");
  });
});
