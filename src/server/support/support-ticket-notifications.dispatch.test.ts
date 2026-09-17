import { afterEach, describe, expect, it, vi } from "vitest";

const { updateMany, findUnique, findMany } = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { supportTicketNotification: { updateMany, findUnique, findMany } } }));

import { dispatchSupportTicketNotification, processSupportTicketNotificationQueue } from "./support-ticket-notifications";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  updateMany.mockReset();
  findUnique.mockReset();
  findMany.mockReset();
});

describe("support notification delivery boundaries", () => {
  function prepareDelivery(attemptCount = 1) {
    vi.stubEnv("MS_GRAPH_TENANT_ID", "tenant");
    vi.stubEnv("MS_GRAPH_CLIENT_ID", "client");
    vi.stubEnv("MS_GRAPH_CLIENT_SECRET", "secret");
    vi.stubEnv("SUPPORT_AGENT_NOTIFY_SENDER", "support@example.test");
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({ id: "n1", recipientEmail: "reporter@example.test", subject: "Resolved", body: "Recorded fix", attemptCount });
    return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fixture-token" }), { status: 200 }));
  }

  it("sends to the recorded reporter and persists provider acceptance", async () => {
    const transport = prepareDelivery();
    transport.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await expect(dispatchSupportTicketNotification("n1")).resolves.toEqual({ kind: "accepted", notificationId: "n1" });
    expect(JSON.parse(String(transport.mock.calls[1]?.[1]?.body))).toMatchObject({ message: { toRecipients: [{ emailAddress: { address: "reporter@example.test" } }], body: { content: "Recorded fix" } } });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED", providerAcceptedAt: expect.any(Date), nextAttemptAt: null }) }));
  });

  it.each(["server-error", "connection-lost"])("does not retry an ambiguous %s after send began", async (failure) => {
    const transport = prepareDelivery();
    if (failure === "server-error") transport.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else transport.mockRejectedValueOnce(new Error("Connection lost after dispatch"));
    await expect(dispatchSupportTicketNotification("n1")).resolves.toMatchObject({ kind: "unknown" });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "UNKNOWN", nextAttemptAt: null }) }));
  });

  it("stops automatically retrying definite failures at the attempt ceiling", async () => {
    const transport = prepareDelivery(5);
    transport.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(dispatchSupportTicketNotification("n1")).resolves.toMatchObject({ kind: "failed" });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", nextAttemptAt: null }) }));
  });

  it("does not contact the provider when another worker owns the notification", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const transport = vi.spyOn(globalThis, "fetch");
    await expect(dispatchSupportTicketNotification("n1")).resolves.toEqual({ kind: "skipped" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("moves an expired worker lease to UNKNOWN without retrying it", async () => {
    findMany.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
    await expect(processSupportTicketNotificationQueue()).resolves.toMatchObject({ processed: 0 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "IN_FLIGHT", leaseUntil: expect.any(Object) }),
      data: expect.objectContaining({ status: "UNKNOWN" }),
    }));
  });

  it("marks token responses without an access token as definite failures before sendMail", async () => {
    vi.stubEnv("MS_GRAPH_TENANT_ID", "tenant");
    vi.stubEnv("MS_GRAPH_CLIENT_ID", "client");
    vi.stubEnv("MS_GRAPH_CLIENT_SECRET", "secret");
    vi.stubEnv("SUPPORT_AGENT_NOTIFY_SENDER", "support@example.com");
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({ id: "n1", recipientEmail: "r@example.com", subject: "Subject", body: "Body", attemptCount: 1 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(dispatchSupportTicketNotification("n1")).resolves.toMatchObject({ kind: "failed", notificationId: "n1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });
});
