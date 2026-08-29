import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, callAnthropicMock } = vi.hoisted(() => ({
  prismaMock: {
    client: { findFirst: vi.fn() },
    clientEmailTemplate: { create: vi.fn() },
    aiUsageEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  callAnthropicMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./anthropic-messages", () => ({
  callAnthropicMessages: callAnthropicMock,
  AI_CALL_TIMEOUT_MS: 20_000,
}));

import {
  SEQUENCE_CADENCE_DAYS,
  SEQUENCE_DRAFTING_TOOL,
  SEQUENCE_STEP_CATEGORIES,
} from "@/lib/ai/sequence-drafting";
import { canApproveTemplate } from "@/lib/email-templates/template-policy";

import { draftSequenceForClient } from "./draft-sequence";

const CLIENT = {
  id: "client-1",
  slug: "acme-roofing",
  name: "Acme Roofing",
  industry: "Construction",
  website: "acme.example",
  notes: "Family firm.",
  briefTaxonomyLinks: [
    { term: { kind: "SERVICE_AREA", displayValue: "Flat roof repair" } },
    { term: { kind: "JOB_TITLE", displayValue: "Facilities Manager" } },
  ],
};

/** Five well-formed emails — the shape a good model run returns. */
function goodSteps() {
  return SEQUENCE_STEP_CATEGORIES.map((_c, i) => ({
    subject: `Roofing help for {{company_name}} (${i + 1})`,
    body: `Hi {{first_name}},\n\nParagraph ${i + 1}.\n\nThanks`,
  }));
}

function modelAnswers(steps: unknown, usage = { inputTokens: 900, outputTokens: 600 }) {
  callAnthropicMock.mockResolvedValue({
    content: [{ type: "tool_use", name: SEQUENCE_DRAFTING_TOOL.name, input: { steps } }],
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

/** The rows the transaction was asked to create. */
function createdRows(): Array<Record<string, unknown>> {
  return prismaMock.clientEmailTemplate.create.mock.calls.map(
    (call) => call[0].data as Record<string, unknown>,
  );
}

beforeEach(() => {
  prismaMock.client.findFirst.mockReset().mockResolvedValue(CLIENT);
  // Stands in for the real transaction: each `create` call returns a row, and
  // `$transaction` resolves the array it is handed.
  prismaMock.clientEmailTemplate.create
    .mockReset()
    .mockImplementation((args: { data: { name: string } }) => ({
      id: `tpl-${args.data.name}`,
    }));
  prismaMock.$transaction
    .mockReset()
    .mockImplementation(async (ops: unknown[]) => ops);
  prismaMock.aiUsageEvent.create.mockReset().mockResolvedValue({ id: "usage-1" });
  callAnthropicMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  delete process.env.AI_FEATURES;
});

describe("drafting a sequence", () => {
  it("writes one template per cadence day", async () => {
    modelAnswers(goodSteps());
    const result = await draftSequenceForClient({
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result.ok).toBe(true);
    expect(createdRows().length).toBe(SEQUENCE_CADENCE_DAYS.length);
  });

  it("writes them at the right categories, in send order", async () => {
    modelAnswers(goodSteps());
    await draftSequenceForClient({ clientId: "client-1", staffUserId: "staff-1" });

    expect(createdRows().map((r) => r.category)).toEqual([
      ...SEQUENCE_STEP_CATEGORIES,
    ]);
  });

  /**
   * THE GATE THIS FEATURE TURNS ON.
   *
   * `createEmailTemplate` auto-approves anything that would pass approval, and
   * an APPROVED template is sequence-eligible and therefore sendable. This test
   * proves the AI path does NOT do that — and it proves it the only way that
   * means anything, by first asserting that the very copy being written WOULD
   * have been auto-approved. Without that half, a change to the approval rules
   * could make this test pass for the wrong reason.
   */
  it("never approves its own copy, even when the copy would pass approval", async () => {
    const steps = goodSteps();
    modelAnswers(steps);
    await draftSequenceForClient({ clientId: "client-1", staffUserId: "staff-1" });

    const rows = createdRows();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // The copy is genuinely approvable — so DRAFT is a decision, not an accident.
      expect(
        canApproveTemplate({
          name: String(row.name),
          category: row.category as string,
          subject: String(row.subject),
          content: String(row.content),
        }).ok,
      ).toBe(true);

      expect(row.status).toBe("DRAFT");
      expect(row.approvedByStaffUserId).toBeNull();
      expect(row.approvedAt).toBeNull();
    }
  });

  it("records who asked for the drafts", async () => {
    modelAnswers(goodSteps());
    await draftSequenceForClient({ clientId: "client-1", staffUserId: "staff-7" });

    for (const row of createdRows()) {
      expect(row.createdByStaffUserId).toBe("staff-7");
    }
  });

  it("bills the client for the call, with tokens and feature recorded", async () => {
    modelAnswers(goodSteps(), { inputTokens: 900, outputTokens: 600 });
    await draftSequenceForClient({ clientId: "client-1", staffUserId: "staff-1" });

    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledTimes(1);
    const row = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(row.clientId).toBe("client-1");
    expect(row.feature).toBe("SEQUENCE_DRAFTING");
    expect(row.status).toBe("OK");
    expect(row.inputTokens).toBe(900);
    expect(row.outputTokens).toBe(600);
    expect(row.costMicroUsd).toBeGreaterThan(0);
  });

  it("writes all five in one transaction, so a half-sequence cannot exist", async () => {
    modelAnswers(goodSteps());
    await draftSequenceForClient({ clientId: "client-1", staffUserId: "staff-1" });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("passes the client's brief to the model", async () => {
    modelAnswers(goodSteps());
    await draftSequenceForClient({ clientId: "client-1", staffUserId: "staff-1" });

    const sent = callAnthropicMock.mock.calls[0][0].userText as string;
    expect(sent).toContain("Acme Roofing");
    expect(sent).toContain("Flat roof repair");
    expect(sent).toContain("Facilities Manager");
  });
});

describe("when it cannot draft", () => {
  it("writes nothing when the model returns an unusable answer", async () => {
    modelAnswers([{ subject: "only one" , body: "too few" }]);
    const result = await draftSequenceForClient({
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.create).not.toHaveBeenCalled();
  });

  /**
   * The tokens were still spent, so the row must still be written — otherwise a
   * run of bad answers is spend that never reaches an invoice.
   */
  it("still bills for a call whose answer was unusable", async () => {
    modelAnswers([{ subject: "only one", body: "too few" }], {
      inputTokens: 900,
      outputTokens: 30,
    });
    await draftSequenceForClient({ clientId: "client-1", staffUserId: "staff-1" });

    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledTimes(1);
    const row = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(row.status).toBe("OK");
    expect(row.inputTokens).toBe(900);
  });

  it("spends nothing and writes nothing for a client that does not exist", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const result = await draftSequenceForClient({
      clientId: "missing",
      staffUserId: "staff-1",
    });

    expect(result).toEqual({ ok: false, reason: "client_not_found" });
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.create).not.toHaveBeenCalled();
  });

  it("refuses, records and writes nothing when the AI switch is off", async () => {
    process.env.AI_FEATURES = "off";
    const result = await draftSequenceForClient({
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result.ok).toBe(false);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.create).not.toHaveBeenCalled();
    const row = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(row.status).toBe("REFUSED");
    expect(row.feature).toBe("SEQUENCE_DRAFTING");
  });

  it("refuses and writes nothing when there is no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await draftSequenceForClient({
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result).toEqual({ ok: false, reason: "no_api_key" });
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.create).not.toHaveBeenCalled();
  });

  it("writes nothing when the call itself fails", async () => {
    callAnthropicMock.mockRejectedValue(new Error("anthropic_http_529: overloaded"));
    const result = await draftSequenceForClient({
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result.ok).toBe(false);
    expect(prismaMock.clientEmailTemplate.create).not.toHaveBeenCalled();
    const row = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(row.status).toBe("ERROR");
  });
});

describe("what the operator is told", () => {
  it("reports unknown placeholders so a person is warned before reading", async () => {
    const steps = goodSteps();
    steps[0].body = "Hi {{first_name}}, about {{industry_sector}}.";
    modelAnswers(steps);

    const result = await draftSequenceForClient({
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.unknownPlaceholders).toContain("industry_sector");
    }
  });

  it("names each draft with its cadence day so runs can be told apart", async () => {
    modelAnswers(goodSteps());
    await draftSequenceForClient({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: new Date("2026-08-29T10:00:00Z"),
    });

    const names = createdRows().map((r) => String(r.name));
    expect(names[0]).toContain("2026-08-29");
    expect(names[0]).toContain("day 1");
    expect(names[names.length - 1]).toContain("day 25");
  });
});
