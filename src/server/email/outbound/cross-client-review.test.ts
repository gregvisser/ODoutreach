import { expect, it, vi } from "vitest";
import type { OutboundEmail } from "@/generated/prisma/client";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { contactHistoryToken, crossClientPayloadToken, hasCurrentCrossClientApproval } from "./cross-client-review";

it("keeps a reviewed payload valid across JSONB key ordering but rejects changed content and history", () => {
  const row = { id: "outbound", clientId: "client", toEmail: "test@example.test", subject: "Reviewed", bodySnapshot: "Body",
    metadata: { sendOrigin: "STAFF_REVIEWED_SINGLE_EMAIL", headers: { z: "last", a: "first" } },
  } as unknown as OutboundEmail;
  const history = [{ id: "recent", clientId: "other", clientName: "Other", sentAt: "2026-09-09T00:00:00.000Z" }];
  const approval = { staffUserId: "staff", historyToken: contactHistoryToken(history), payloadToken: crossClientPayloadToken(row) };
  const reloaded = { ...row, metadata: { crossClientApproval: approval, headers: { a: "first", z: "last" }, sendOrigin: "STAFF_REVIEWED_SINGLE_EMAIL" } };
  expect(hasCurrentCrossClientApproval(reloaded, history)).toBe(true);
  expect(hasCurrentCrossClientApproval({ ...reloaded, bodySnapshot: "Changed" }, history)).toBe(false);
  expect(hasCurrentCrossClientApproval(reloaded, [...history, { ...history[0], id: "newer" }])).toBe(false);
});
