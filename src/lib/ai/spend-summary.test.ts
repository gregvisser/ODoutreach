import { describe, expect, it } from "vitest";

import {
  aiFeatureLabel,
  resolveBillingMonth,
  summariseAiSpend,
  type AiSpendGroup,
} from "./spend-summary";

/**
 * Tests for the billing fold behind the AI spend screen.
 *
 * These are invoice rules, not display preferences. Each one below describes a
 * way the total on the screen could be WRONG in Greg's favour or against it,
 * which is the only reason this module is separated from the Prisma query at
 * all: the aggregation is pure so it can be tested without a database.
 */

function group(over: Partial<AiSpendGroup> = {}): AiSpendGroup {
  return {
    clientId: "client-1",
    clientSlugAtCall: "acme",
    clientName: "Acme Ltd",
    feature: "REPLY_CLASSIFICATION",
    status: "OK",
    model: "claude-haiku-4-5-20251001",
    rateVersion: "2026-08-29-unverified",
    calls: 1,
    inputTokens: 1_000,
    outputTokens: 100,
    costMicroUsd: 1_500,
    ...over,
  };
}

describe("summariseAiSpend", () => {
  it("bills per client, not per slug, when a workspace has been renamed", () => {
    // The ledger stores the slug AS IT WAS at the moment of the call, on
    // purpose. A workspace renamed mid-month would therefore appear as two
    // customers and produce two invoices for one client if the fold keyed on
    // the slug string.
    const summary = summariseAiSpend([
      group({ clientSlugAtCall: "acme", costMicroUsd: 1_500, calls: 1 }),
      group({ clientSlugAtCall: "acme-group", costMicroUsd: 2_500, calls: 3 }),
    ]);

    expect(summary.clients).toHaveLength(1);
    expect(summary.clients[0]?.costMicroUsd).toBe(4_000);
    expect(summary.clients[0]?.totalCalls).toBe(4);
    // The most recent name wins for display, but both slugs are kept so a
    // queried invoice line can be traced back to the ledger rows.
    expect(summary.clients[0]?.slugs).toEqual(["acme", "acme-group"]);
  });

  it("still bills for a client whose workspace has since been deleted", () => {
    // `AiUsageEvent.clientId` is `onDelete: SetNull`, so a hard-deleted
    // workspace leaves its ledger rows behind with a null id. Money already
    // spent is still owed; dropping those rows silently under-bills.
    const summary = summariseAiSpend([
      group({ clientId: null, clientName: null, clientSlugAtCall: "gone-co", costMicroUsd: 900 }),
    ]);

    expect(summary.clients).toHaveLength(1);
    expect(summary.clients[0]?.clientId).toBeNull();
    expect(summary.clients[0]?.clientName).toBeNull();
    expect(summary.clients[0]?.slugs).toEqual(["gone-co"]);
    expect(summary.totals.costMicroUsd).toBe(900);
  });

  it("keeps two different deleted workspaces apart", () => {
    // Both have a null client id. Folding on the id alone would merge every
    // deleted workspace in the estate into one nameless invoice line.
    const summary = summariseAiSpend([
      group({ clientId: null, clientName: null, clientSlugAtCall: "gone-a", costMicroUsd: 100 }),
      group({ clientId: null, clientName: null, clientSlugAtCall: "gone-b", costMicroUsd: 200 }),
    ]);

    expect(summary.clients).toHaveLength(2);
    expect(summary.clients.map((c) => c.slugs[0])).toEqual(["gone-b", "gone-a"]);
  });

  it("counts refusals and errors as calls but never as cost", () => {
    // This is production TODAY: no API key is set, so every call refuses. The
    // screen has to show that something is happening and that it costs nothing,
    // because "0 calls" and "480 calls, all refused" mean opposite things.
    const summary = summariseAiSpend([
      group({ status: "OK", calls: 2, costMicroUsd: 3_000 }),
      group({
        status: "REFUSED",
        calls: 40,
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: 0,
      }),
      group({ status: "ERROR", calls: 5, inputTokens: 0, outputTokens: 0, costMicroUsd: 0 }),
    ]);

    const row = summary.clients[0];
    expect(row?.okCalls).toBe(2);
    expect(row?.refusedCalls).toBe(40);
    expect(row?.errorCalls).toBe(5);
    expect(row?.totalCalls).toBe(47);
    expect(row?.costMicroUsd).toBe(3_000);
    expect(summary.totals.refusedCalls).toBe(40);
    expect(summary.totals.errorCalls).toBe(5);
  });

  it("puts the largest bill first, and breaks ties by name so the order is stable", () => {
    const summary = summariseAiSpend([
      group({ clientId: "c-small", clientName: "Small", costMicroUsd: 10 }),
      group({ clientId: "c-big", clientName: "Big", costMicroUsd: 900 }),
      group({ clientId: "c-zed", clientName: "Zed", costMicroUsd: 10 }),
    ]);

    expect(summary.clients.map((c) => c.clientName)).toEqual(["Big", "Small", "Zed"]);
  });

  it("breaks each client down by feature, largest first", () => {
    // An invoice line the client can query has to say what it bought.
    const summary = summariseAiSpend([
      group({ feature: "REPLY_CLASSIFICATION", calls: 3, costMicroUsd: 300 }),
      group({ feature: "SEQUENCE_DRAFTING", calls: 1, costMicroUsd: 900 }),
    ]);

    expect(summary.clients[0]?.features).toEqual([
      { feature: "SEQUENCE_DRAFTING", calls: 1, costMicroUsd: 900 },
      { feature: "REPLY_CLASSIFICATION", calls: 3, costMicroUsd: 300 },
    ]);
  });

  it("flags the whole summary when any row was priced with an unverified rate list", () => {
    // The rates shipped in cycle 85 were never checked against the published
    // price list. A total built from them must never be presented as fact.
    const summary = summariseAiSpend([
      group({ rateVersion: "2026-08-29-unverified" }),
      group({ clientId: "c-2", rateVersion: "2026-08-29-unverified" }),
    ]);

    expect(summary.hasUnverifiedRates).toBe(true);
    expect(summary.rateVersions).toEqual(["2026-08-29-unverified"]);
  });

  it("reports an empty ledger as zero rather than as nothing at all", () => {
    const summary = summariseAiSpend([]);

    expect(summary.clients).toEqual([]);
    expect(summary.totals.costMicroUsd).toBe(0);
    expect(summary.totals.totalCalls).toBe(0);
    expect(summary.hasUnverifiedRates).toBe(false);
  });
});

describe("aiFeatureLabel", () => {
  it("never shows the raw enum to staff or to a client", () => {
    expect(aiFeatureLabel("REPLY_CLASSIFICATION")).toBe("Reply classification");
  });

  it("humanises a feature it has not been taught yet, rather than dropping it", () => {
    // A feature added to the enum without a label here must still appear on the
    // breakdown — an invisible line item is an unbilled one.
    expect(aiFeatureLabel("SEQUENCE_DRAFTING")).toBe("Sequence drafting");
  });
});

describe("resolveBillingMonth", () => {
  const now = new Date("2026-08-29T14:00:00.000Z");

  it("defaults to the month in progress", () => {
    const month = resolveBillingMonth(undefined, now);

    expect(month.key).toBe("2026-08");
    expect(month.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(month.endExclusive.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rolls the end of December into the next year", () => {
    const month = resolveBillingMonth("2026-12", now);

    expect(month.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(month.endExclusive.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("falls back to the current month rather than throwing on a hand-typed URL", () => {
    // The month arrives in a query string, so it is attacker-controlled text.
    // A 500 on `?month=lol` is a broken screen; a silent fallback is not.
    for (const bad of ["", "lol", "2026-13", "2026-00", "2026-8", "26-08", "2026-08-01"]) {
      expect(resolveBillingMonth(bad, now).key).toBe("2026-08");
    }
  });

  it("offers recent months to pick from, newest first, without inventing future ones", () => {
    const month = resolveBillingMonth("2026-06", now);

    expect(month.recentKeys[0]).toBe("2026-08");
    expect(month.recentKeys).toContain("2026-06");
    expect(month.recentKeys.every((key) => key <= "2026-08")).toBe(true);
  });
});
