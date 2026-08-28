import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffUser } from "@/generated/prisma/client";

const { prismaMock, accessMock, mutatorMock } = vi.hoisted(() => {
  const prismaMock = {
    client: { findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prismaMock, accessMock: vi.fn(), mutatorMock: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/server/tenant/access", () => ({ getAccessibleClientIds: accessMock }));
vi.mock("@/server/mailbox-identities/mutator-access", () => ({
  getClientMailboxMutationAllowed: mutatorMock,
}));

import { setClientOpenTracking } from "./open-tracking-opt-in";

const staff = { id: "staff-1", role: "OPERATOR" } as StaffUser;

const VERIFIED = {
  outreachLinkDomain: "go.paratus365.com",
  outreachLinkDomainVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
  openTrackingEnabledAt: null,
};

beforeEach(() => {
  prismaMock.client.findFirst.mockReset();
  prismaMock.client.update.mockReset();
  prismaMock.auditLog.create.mockReset();
  prismaMock.$transaction.mockReset();
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: typeof prismaMock) => Promise<unknown>) => cb(prismaMock),
  );
  prismaMock.client.update.mockResolvedValue({ id: "c1" });
  prismaMock.auditLog.create.mockResolvedValue({ id: "log-1" });
  accessMock.mockResolvedValue(["c1"]);
  mutatorMock.mockResolvedValue(true);
});

describe("setClientOpenTracking — the gate refuses rather than corrects", () => {
  it("REFUSES to switch tracking on when the link domain is not verified", async () => {
    prismaMock.client.findFirst.mockResolvedValue({
      outreachLinkDomain: "go.paratus365.com",
      outreachLinkDomainVerifiedAt: null,
      openTrackingEnabledAt: null,
    });

    const result = await setClientOpenTracking({ staff, clientId: "c1", enabled: true });

    expect(result).toMatchObject({ ok: false, code: "LINK_DOMAIN_NOT_VERIFIED" });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("REFUSES to switch tracking on when there is no link domain at all", async () => {
    prismaMock.client.findFirst.mockResolvedValue({
      outreachLinkDomain: null,
      outreachLinkDomainVerifiedAt: null,
      openTrackingEnabledAt: null,
    });

    const result = await setClientOpenTracking({ staff, clientId: "c1", enabled: true });

    expect(result).toMatchObject({ ok: false, code: "LINK_DOMAIN_NOT_VERIFIED" });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("switches tracking on for a verified client and stamps who did it", async () => {
    prismaMock.client.findFirst.mockResolvedValue(VERIFIED);

    const result = await setClientOpenTracking({ staff, clientId: "c1", enabled: true });

    expect(result.ok).toBe(true);
    const data = prismaMock.client.update.mock.calls[0]?.[0]?.data;
    expect(data.openTrackingEnabledAt).toBeInstanceOf(Date);
    expect(data.openTrackingEnabledByStaffUserId).toBe("staff-1");
  });

  it("always allows switching tracking OFF, even with an unverified domain", async () => {
    prismaMock.client.findFirst.mockResolvedValue({
      outreachLinkDomain: null,
      outreachLinkDomainVerifiedAt: null,
      openTrackingEnabledAt: new Date("2026-08-20T00:00:00.000Z"),
    });

    const result = await setClientOpenTracking({ staff, clientId: "c1", enabled: false });

    expect(result.ok).toBe(true);
    const data = prismaMock.client.update.mock.calls[0]?.[0]?.data;
    expect(data.openTrackingEnabledAt).toBeNull();
    expect(data.openTrackingEnabledByStaffUserId).toBeNull();
  });

  it("records an audit entry naming the domain the opt-in was granted against", async () => {
    prismaMock.client.findFirst.mockResolvedValue(VERIFIED);

    await setClientOpenTracking({ staff, clientId: "c1", enabled: true });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffUserId: "staff-1",
          clientId: "c1",
          entityType: "Client.openTracking",
          metadata: expect.objectContaining({
            enabled: true,
            linkDomain: "go.paratus365.com",
            linkDomainVerifiedAt: "2026-08-01T00:00:00.000Z",
          }),
        }),
      }),
    );
  });

  it("refuses a client this staff member cannot reach, without saying it exists", async () => {
    accessMock.mockResolvedValue(["other-client"]);

    const result = await setClientOpenTracking({ staff, clientId: "c1", enabled: true });

    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prismaMock.client.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("refuses staff without mailbox-mutation permission", async () => {
    mutatorMock.mockResolvedValue(false);

    const result = await setClientOpenTracking({ staff, clientId: "c1", enabled: true });

    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("refuses a soft-deleted workspace", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const result = await setClientOpenTracking({ staff, clientId: "c1", enabled: true });

    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", deletedAt: null } }),
    );
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });
});
