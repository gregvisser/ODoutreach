import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Blocker 2 — "the product shows two truths about one client".
 *
 * On 2026-08-27 a client's Overview read "Activity — not started" while its own
 * Activity tab read "Emails sent 1". One fact, two answers, on two screens of
 * the same product.
 *
 * The cause was not bad data. The two screens asked different questions:
 *
 *   * Activity tab   — `loadClientOutreachMetrics` → every OutboundEmail row
 *                      whose send is PROVEN (sentAt or providerMessageId, in a
 *                      provider-confirmed status).
 *   * Overview row   — `getRecentGovernedSendsForClient` → only rows whose
 *                      `metadata.kind` is one of three PROOF/PILOT sentinels
 *                      (governedTestSend / internalProof / controlledPilot).
 *
 * A real sequence introduction carries `metadata.kind = "sequenceIntroSend"`,
 * so the entire class of send this product exists to make was invisible to the
 * Overview. The moment outreach went live, the Overview started lying.
 *
 * These tests hold the fix closed in both directions:
 *   (1) a real sequence send must be visible to the Overview's source;
 *   (2) the Overview's predicate and the Activity tab's predicate must be the
 *       SAME predicate — not two that happen to agree today.
 */

type Call = { model: string; method: string; args: Record<string, unknown> };

const { calls, prismaMock } = vi.hoisted(() => {
  const calls: Call[] = [];
  const results = new Map<string, unknown>();
  // Any model, any method: record the call, return something harmless. The
  // metrics loader touches eight models across fourteen aggregates; enumerating
  // them here would just be a second place to keep in step.
  const prismaMock = new Proxy(
    {},
    {
      get(_t, model: string) {
        return new Proxy(
          {},
          {
            get(_t2, method: string) {
              return async (args: Record<string, unknown>) => {
                calls.push({ model, method, args });
                if (method === "findFirst") {
                  return results.get(`${model}.findFirst`) ?? null;
                }
                return [];
              };
            },
          },
        );
      },
    },
  );
  return { calls, results, prismaMock };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
// Seed-allowlist exclusion is flag-gated and OFF by default; pin it so the
// predicate comparison below is not at the mercy of the ambient environment.
vi.mock("@/server/internal-seed/seed-allowlist", () => ({
  listActiveInternalSeedEmails: async () => [] as string[],
}));

import { buildProvenSentWhere, getLatestProvenSendAt } from "./proven-send";
import { loadClientOutreachMetrics } from "./outreach-metrics";

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("the Overview and the Activity tab count the same sends", () => {
  it("counts a real sequence introduction — the send the old Overview query could not see", () => {
    // This is what `sendSequenceStepBatch` writes for a live outreach send.
    const sequenceIntro = {
      status: "SENT",
      sentAt: new Date("2026-08-20T09:00:00.000Z"),
      providerMessageId: "graph-abc",
      metadata: { kind: "sequenceIntroSend" },
    };

    const where = buildProvenSentWhere({ clientId: "c1", seedEmails: [] });

    // The predicate must key off send PROOF, never off a metadata sentinel.
    // `metadata` appearing anywhere in it is the old defect returning.
    expect(JSON.stringify(where)).not.toContain("metadata");

    // And the row above must satisfy it: confirmed status + proof of sending.
    const statuses = (where.status as { in: string[] }).in;
    expect(statuses).toContain(sequenceIntro.status);
    expect(where.OR).toEqual([
      { sentAt: { not: null } },
      { providerMessageId: { not: null } },
    ]);
  });

  it("asks the database for the newest proven send, newest first, one row", async () => {
    await getLatestProvenSendAt("c1");

    const call = calls.find(
      (c) => c.model === "outboundEmail" && c.method === "findFirst",
    );
    expect(call).toBeDefined();
    expect(call?.args.orderBy).toEqual({ sentAt: "desc" });
    expect((call?.args.where as { clientId: string }).clientId).toBe("c1");
  });

  /**
   * THE DIVERGENCE GUARD. This is the test the blocker actually asked for:
   * one that fails if the two screens can drift apart again.
   *
   * It runs both loaders against the same mocked database and compares the
   * WHERE clause each one sends for "an email we can prove we sent". Only the
   * client scope is allowed to differ — the metrics loader aggregates over a
   * list of clients, the Overview asks about one. Everything else — the status
   * set, the proof clause, the seed-address exclusion — must be identical.
   */
  it("issues the identical proven-send predicate on both screens", async () => {
    await getLatestProvenSendAt("c1");
    await loadClientOutreachMetrics("c1", ["c1"]);

    const overviewWhere = calls.find(
      (c) => c.model === "outboundEmail" && c.method === "findFirst",
    )?.args.where as Record<string, unknown> | undefined;

    // The metrics loader's FIRST outboundEmail aggregate is the "sent with
    // proof" count that feeds the Activity tab's "Emails sent" card.
    const activityWhere = calls.find(
      (c) => c.model === "outboundEmail" && c.method === "groupBy",
    )?.args.where as Record<string, unknown> | undefined;

    expect(overviewWhere).toBeDefined();
    expect(activityWhere).toBeDefined();

    const withoutScope = (w: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(w).filter(([k]) => k !== "clientId"));
    expect(withoutScope(overviewWhere!)).toEqual(withoutScope(activityWhere!));
  });

  /**
   * The structural half of the guard, and the reason the test above is not
   * enough on its own.
   *
   * Value-equality proves the two predicates AGREE. It does not prove they are
   * the SAME predicate — two copies of one literal agree perfectly right up to
   * the day somebody edits one of them. (Verified: with the shared builder in
   * place but `outreach-metrics.ts` still holding its own copy, the test above
   * passed.) So this one reads the source and fails if a second definition of
   * the proven-send status set reappears anywhere outside `proven-send.ts`.
   */
  it("keeps exactly one definition of the proven-send status set", async () => {
    const { readFile } = await import("node:fs/promises");
    const metricsSource = await readFile(
      new URL("./outreach-metrics.ts", import.meta.url),
      "utf8",
    );
    // The literal that used to live inline. Its return means the single
    // definition has been forked again.
    expect(metricsSource).not.toMatch(
      /\[\s*"SENT",\s*"DELIVERED",\s*"REPLIED",\s*"BOUNCED"\s*\]/,
    );
    expect(metricsSource).toContain("buildProvenSentWhere");
  });
});
