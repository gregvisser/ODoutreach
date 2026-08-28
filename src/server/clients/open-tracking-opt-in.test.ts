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

/**
 * A DNS check that passes, injected by the tests below that are about something
 * ELSE — who switched it on, what the audit records.
 *
 * They have to say so explicitly now, and that is the point: since row 41 the
 * default is a REAL lookup, so a test that stays silent about DNS gets a
 * refusal rather than a pass. Silence cannot authorise tracking, in a test any
 * more than in production.
 */
const passingDns = async () => ({ pass: true, checks: [], failedLabels: [] });

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

    const result = await setClientOpenTracking({
      staff,
      clientId: "c1",
      enabled: true,
      verifyDns: passingDns,
    });

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

    await setClientOpenTracking({
      staff,
      clientId: "c1",
      enabled: true,
      verifyDns: passingDns,
    });

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

/**
 * Row 41's requirement, and the sentence the whole thing turns on: **the system
 * VERIFIES the DNS itself. It never trusts a tick-box.**
 *
 * So switching tracking on is not permitted by a stored flag somebody once set.
 * The action RESOLVES the customer's SPF, DKIM, DMARC and tracking host at the
 * moment of the click, and refuses if any of the four does not pass.
 */
describe("setClientOpenTracking — the DNS is checked LIVE at the moment of the click", () => {
  const PASSING = { pass: true, checks: [], failedLabels: [] };
  const FAILING_SPF = {
    pass: false,
    checks: [{ label: "SPF" as const, pass: false, detail: "SPF must end in -all." }],
    failedLabels: ["SPF"],
  };

  it("REFUSES to switch on when the live check fails, and writes nothing", async () => {
    prismaMock.client.findFirst.mockResolvedValue(VERIFIED);

    const result = await setClientOpenTracking({
      staff,
      clientId: "c1",
      enabled: true,
      verifyDns: async () => FAILING_SPF,
    });

    expect(result).toMatchObject({ ok: false, code: "EMAIL_AUTH_NOT_VERIFIED" });
    // Specific enough to forward straight to the customer's IT department.
    expect(result.ok === false && result.message).toMatch(/SPF/);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("switches on when the live check passes, and stamps the verification time", async () => {
    prismaMock.client.findFirst.mockResolvedValue(VERIFIED);

    const result = await setClientOpenTracking({
      staff,
      clientId: "c1",
      enabled: true,
      verifyDns: async () => PASSING,
    });

    expect(result.ok).toBe(true);
    const data = prismaMock.client.update.mock.calls[0]?.[0]?.data;
    expect(data.openTrackingEnabledAt).toBeInstanceOf(Date);
    // Written from the check that just ran. This is what the send-time freshness
    // gate reads, so it must never be set without a passing check behind it.
    expect(data.trackingDnsVerifiedAt).toBeInstanceOf(Date);
    expect(data.trackingDnsCheckedAt).toBeInstanceOf(Date);
  });

  it("does NOT run a DNS check when switching tracking OFF", async () => {
    // Turning tracking off can only make a send safer. Gating it behind a
    // network call would mean a customer with broken DNS could not be switched
    // off during an incident — the wrong shape entirely.
    prismaMock.client.findFirst.mockResolvedValue({
      ...VERIFIED,
      openTrackingEnabledAt: new Date("2026-08-20T00:00:00.000Z"),
    });
    const verifyDns = vi.fn();

    const result = await setClientOpenTracking({
      staff,
      clientId: "c1",
      enabled: false,
      verifyDns,
    });

    expect(result.ok).toBe(true);
    expect(verifyDns).not.toHaveBeenCalled();
  });

  it("REFUSES when the DNS check itself throws — an error is never a pass", async () => {
    prismaMock.client.findFirst.mockResolvedValue(VERIFIED);

    const result = await setClientOpenTracking({
      staff,
      clientId: "c1",
      enabled: true,
      verifyDns: async () => {
        throw new Error("all nameservers unreachable");
      },
    });

    expect(result).toMatchObject({ ok: false, code: "EMAIL_AUTH_NOT_VERIFIED" });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("records the check results in the audit entry", async () => {
    prismaMock.client.findFirst.mockResolvedValue(VERIFIED);

    await setClientOpenTracking({
      staff,
      clientId: "c1",
      enabled: true,
      verifyDns: async () => ({
        pass: true,
        checks: [{ label: "SPF" as const, pass: true, detail: "ok" }],
        failedLabels: [],
      }),
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            enabled: true,
            dnsChecks: expect.arrayContaining([
              expect.objectContaining({ label: "SPF", pass: true }),
            ]),
          }),
        }),
      }),
    );
  });
});
