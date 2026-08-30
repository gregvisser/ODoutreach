import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, reportErrorMock } = vi.hoisted(() => ({
  prismaMock: { aiUsageEvent: { create: vi.fn() } },
  reportErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: reportErrorMock,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AI_MODELS, RATE_VERSION } from "@/lib/ai/model-catalog";

import { runMeteredAiCall } from "./metered-call";

const CLIENT = { id: "client-1", slug: "train-hugger" };

// Deliberately NOT REPLY_CLASSIFICATION: that feature carries prospect personal
// data and, per the CR-10 gate below, is refused before `invoke` regardless of
// API key. These generic ledger/refusal tests are about `runMeteredAiCall`
// itself, not about that one feature's data class, so they run against a
// feature the CR-10 gate declares clean. Same model string either way (both
// map to the same priced model), so the cost math is unaffected.
const baseArgs = {
  client: CLIENT,
  feature: "SEQUENCE_DRAFTING" as const,
  model: AI_MODELS.SEQUENCE_DRAFTING,
  apiKey: "sk-ant-test",
  subject: { type: "InboundReply", id: "reply-1" },
};

/** The row handed to prisma by the call under test. */
function writtenRow() {
  expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledTimes(1);
  return prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
}

beforeEach(() => {
  prismaMock.aiUsageEvent.create.mockReset();
  prismaMock.aiUsageEvent.create.mockResolvedValue({ id: "usage-1" });
  reportErrorMock.mockReset();
  delete process.env.AI_FEATURES;
});

describe("a successful call", () => {
  it("returns the result and writes exactly one ledger row", async () => {
    const out = await runMeteredAiCall({
      ...baseArgs,
      invoke: async () => ({
        result: { label: "POSITIVE" },
        usage: { inputTokens: 700, outputTokens: 40 },
      }),
    });

    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result).toEqual({ label: "POSITIVE" });
    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledTimes(1);
  });

  it("records model, tokens, cost and client — the five things an invoice needs", async () => {
    await runMeteredAiCall({
      ...baseArgs,
      invoke: async () => ({
        result: null,
        usage: { inputTokens: 700, outputTokens: 40 },
      }),
    });

    const row = writtenRow();
    expect(row.model).toBe(AI_MODELS.SEQUENCE_DRAFTING);
    expect(row.inputTokens).toBe(700);
    expect(row.outputTokens).toBe(40);
    expect(row.clientId).toBe("client-1");
    // 700 in at $1/MTok + 40 out at $5/MTok = 900 micro-USD.
    expect(row.costMicroUsd).toBe(900);
    expect(row.status).toBe("OK");
    expect(row.feature).toBe("SEQUENCE_DRAFTING");
  });

  it("stores the rates and rate version, so a corrected price list can recompute", async () => {
    await runMeteredAiCall({
      ...baseArgs,
      invoke: async () => ({ result: null, usage: { inputTokens: 10, outputTokens: 2 } }),
    });

    const row = writtenRow();
    expect(row.rateVersion).toBe(RATE_VERSION);
    expect(row.inputRatePerMTokMicroUsd).toBeGreaterThan(0);
    expect(row.outputRatePerMTokMicroUsd).toBeGreaterThan(0);
    // The stored cost must be exactly reproducible from the stored numbers.
    const recomputed = Math.round(
      (row.inputTokens * row.inputRatePerMTokMicroUsd) / 1_000_000 +
        (row.outputTokens * row.outputRatePerMTokMicroUsd) / 1_000_000,
    );
    expect(recomputed).toBe(row.costMicroUsd);
  });

  it("keeps the client slug on the row, so the ledger survives client deletion", async () => {
    await runMeteredAiCall({
      ...baseArgs,
      invoke: async () => ({ result: null, usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    expect(writtenRow().clientSlugAtCall).toBe("train-hugger");
  });

  it("records what the charge was for", async () => {
    await runMeteredAiCall({
      ...baseArgs,
      invoke: async () => ({ result: null, usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    const row = writtenRow();
    expect(row.subjectType).toBe("InboundReply");
    expect(row.subjectId).toBe("reply-1");
  });
});

describe("refusals — nothing is called, and the refusal is still recorded", () => {
  it("refuses when the global switch is off", async () => {
    process.env.AI_FEATURES = "off";
    const invoke = vi.fn();

    const out = await runMeteredAiCall({ ...baseArgs, invoke });

    expect(out.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    const row = writtenRow();
    expect(row.status).toBe("REFUSED");
    expect(row.outcomeCode).toBe("ai_features_switched_off");
    expect(row.costMicroUsd).toBe(0);
  });

  it("refuses when no API key is configured, rather than quietly returning a fake answer", async () => {
    const invoke = vi.fn();

    const out = await runMeteredAiCall({ ...baseArgs, apiKey: undefined, invoke });

    expect(out.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(writtenRow().outcomeCode).toBe("no_api_key");
  });

  it("refuses a model it holds no price for — an uninvoiceable call is not made", async () => {
    const invoke = vi.fn();

    const out = await runMeteredAiCall({
      ...baseArgs,
      model: "claude-unpriced-model" as never,
      invoke,
    });

    expect(out.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(writtenRow().outcomeCode).toBe("no_rate_for_model");
  });
});

describe("a call that fails", () => {
  it("still writes a ledger row, so a silent error rate is impossible", async () => {
    const out = await runMeteredAiCall({
      ...baseArgs,
      invoke: async () => {
        throw new Error("upstream 529 overloaded");
      },
    });

    expect(out.ok).toBe(false);
    const row = writtenRow();
    expect(row.status).toBe("ERROR");
    expect(row.outcomeCode).toMatch(/529|overloaded|call_failed/);
  });

  it("does not throw at the caller — a model outage must not break reply ingestion", async () => {
    await expect(
      runMeteredAiCall({
        ...baseArgs,
        invoke: async () => {
          throw new Error("boom");
        },
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("survives the ledger write itself failing, and reports it loudly", async () => {
    prismaMock.aiUsageEvent.create.mockRejectedValue(new Error("db down"));

    const out = await runMeteredAiCall({
      ...baseArgs,
      invoke: async () => ({ result: "x", usage: { inputTokens: 5, outputTokens: 5 } }),
    });

    // The paid call succeeded, so the caller still gets its answer...
    expect(out.ok).toBe(true);
    // ...but money was spent and not recorded, which must never be silent.
    expect(reportErrorMock).toHaveBeenCalled();
  });
});

describe("the personal-data processor gate (CR-10)", () => {
  it("refuses a feature declared to carry prospect personal data when its vendor has no recorded processor allowance — EVEN WITH A REAL API KEY", async () => {
    const invoke = vi.fn();

    const out = await runMeteredAiCall({
      ...baseArgs,
      feature: "REPLY_CLASSIFICATION",
      model: AI_MODELS.REPLY_CLASSIFICATION,
      apiKey: "sk-ant-test",
      invoke,
    });

    expect(out.ok).toBe(false);
    // The whole point of this gate: an API key must not, by itself, be enough.
    expect(invoke).not.toHaveBeenCalled();
    const row = writtenRow();
    expect(row.status).toBe("REFUSED");
    expect(row.outcomeCode).toBe("no_processor_allowance");
    expect(row.costMicroUsd).toBe(0);
    expect(row.feature).toBe("REPLY_CLASSIFICATION");
  });

  it("leaves a feature NOT declared to carry personal data unaffected — the gate is narrow, not an off switch", async () => {
    const invoke = vi.fn().mockResolvedValue({
      result: "ok",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    // baseArgs.feature is SEQUENCE_DRAFTING, declared clean by the CR-10 policy.
    const out = await runMeteredAiCall({ ...baseArgs, invoke });

    expect(out.ok).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(writtenRow().status).toBe("OK");
  });
});
