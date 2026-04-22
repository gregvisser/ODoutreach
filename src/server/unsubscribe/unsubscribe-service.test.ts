import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateRawUnsubscribeToken,
  hashUnsubscribeToken,
} from "@/lib/unsubscribe/unsubscribe-token";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    unsubscribeToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    suppressedEmail: { upsert: vi.fn() },
    contact: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prismaMock };
});

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import {
  issueUnsubscribeToken,
  performUnsubscribe,
  resolveUnsubscribeToken,
} from "./unsubscribe-service";

function txRunner() {
  return prismaMock.$transaction.mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        suppressedEmail: prismaMock.suppressedEmail,
        unsubscribeToken: prismaMock.unsubscribeToken,
        contact: prismaMock.contact,
        auditLog: prismaMock.auditLog,
      });
    },
  );
}

describe("issueUnsubscribeToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists only the hash, never the raw token", async () => {
    const raw = generateRawUnsubscribeToken();
    prismaMock.unsubscribeToken.create.mockResolvedValueOnce({
      id: "tok-1",
      tokenHash: hashUnsubscribeToken(raw),
    });

    const result = await issueUnsubscribeToken(
      {
        clientId: "c1",
        contactId: "contact-1",
        outboundEmailId: "out-1",
        email: "Alex@Bidlow.co.uk",
      },
      { rawToken: raw },
    );

    expect(prismaMock.unsubscribeToken.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.unsubscribeToken.create.mock.calls[0]?.[0];
    expect(createArg?.data?.tokenHash).toBe(hashUnsubscribeToken(raw));
    expect(JSON.stringify(createArg)).not.toContain(raw);
    expect(createArg?.data?.email).toBe("alex@bidlow.co.uk");
    expect(createArg?.data?.emailDomain).toBe("bidlow.co.uk");
    expect(createArg?.data?.purpose).toBe("outreach_unsubscribe");
    expect(result.tokenId).toBe("tok-1");
  });

  it("rejects malformed raw tokens", async () => {
    await expect(
      issueUnsubscribeToken(
        { clientId: "c1", email: "alex@bidlow.co.uk" },
        { rawToken: "" },
      ),
    ).rejects.toThrow();
  });

  it("rejects a missing clientId", async () => {
    await expect(
      issueUnsubscribeToken(
        { clientId: "", email: "alex@bidlow.co.uk" },
        { rawToken: generateRawUnsubscribeToken() },
      ),
    ).rejects.toThrow();
  });
});

describe("resolveUnsubscribeToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for malformed tokens without hitting the database", async () => {
    const result = await resolveUnsubscribeToken("   ");
    expect(result).toBeNull();
    expect(prismaMock.unsubscribeToken.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the hash is unknown", async () => {
    prismaMock.unsubscribeToken.findUnique.mockResolvedValueOnce(null);
    const raw = generateRawUnsubscribeToken();
    const result = await resolveUnsubscribeToken(raw);
    expect(result).toBeNull();
  });

  it("returns client + email metadata when the hash matches", async () => {
    const raw = generateRawUnsubscribeToken();
    prismaMock.unsubscribeToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      clientId: "c1",
      contactId: "contact-1",
      outboundEmailId: "out-1",
      email: "alex@bidlow.co.uk",
      emailDomain: "bidlow.co.uk",
      usedAt: null,
      createdAt: new Date("2026-04-22T12:00:00Z"),
      client: { name: "Bidlow" },
    });
    const result = await resolveUnsubscribeToken(raw);
    expect(result?.clientName).toBe("Bidlow");
    expect(result?.email).toBe("alex@bidlow.co.uk");
    expect(result?.usedAt).toBeNull();
  });
});

describe("performUnsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txRunner();
  });

  it("returns `invalid` for unknown tokens and writes nothing", async () => {
    prismaMock.unsubscribeToken.findUnique.mockResolvedValueOnce(null);
    const result = await performUnsubscribe(generateRawUnsubscribeToken());
    expect(result).toEqual({ status: "invalid" });
    expect(prismaMock.suppressedEmail.upsert).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("upserts SuppressedEmail, marks token used, flips contact, writes AuditLog on first redemption", async () => {
    const raw = generateRawUnsubscribeToken();
    prismaMock.unsubscribeToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      clientId: "c1",
      contactId: "contact-1",
      outboundEmailId: "out-1",
      email: "alex@bidlow.co.uk",
      emailDomain: "bidlow.co.uk",
      usedAt: null,
      createdAt: new Date(),
      client: { name: "Bidlow" },
    });

    const result = await performUnsubscribe(raw);

    expect(result).toEqual({
      status: "unsubscribed",
      clientId: "c1",
      clientName: "Bidlow",
      email: "alex@bidlow.co.uk",
    });
    expect(prismaMock.suppressedEmail.upsert).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.suppressedEmail.upsert.mock.calls[0]?.[0]?.where,
    ).toEqual({ clientId_email: { clientId: "c1", email: "alex@bidlow.co.uk" } });
    expect(prismaMock.unsubscribeToken.update).toHaveBeenCalledTimes(1);
    const tokenUpdate = prismaMock.unsubscribeToken.update.mock.calls[0]?.[0];
    expect(tokenUpdate?.data?.usedAt).toBeInstanceOf(Date);
    expect(prismaMock.contact.updateMany).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.contact.updateMany.mock.calls[0]?.[0]?.data?.isSuppressed,
    ).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = prismaMock.auditLog.create.mock.calls[0]?.[0];
    expect(auditArg?.data?.action).toBe("UPDATE");
    expect(auditArg?.data?.entityType).toBe("UnsubscribeToken");
    expect(auditArg?.data?.metadata?.kind).toBe("recipient_unsubscribed");
  });

  it("is idempotent — repeated redemptions return already_unsubscribed without rewriting AuditLog", async () => {
    const raw = generateRawUnsubscribeToken();
    prismaMock.unsubscribeToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      clientId: "c1",
      contactId: null,
      outboundEmailId: null,
      email: "alex@bidlow.co.uk",
      emailDomain: "bidlow.co.uk",
      usedAt: new Date("2026-04-22T12:00:00Z"),
      createdAt: new Date("2026-04-22T11:59:00Z"),
      client: { name: "Bidlow" },
    });

    const result = await performUnsubscribe(raw);

    expect(result).toEqual({
      status: "already_unsubscribed",
      clientId: "c1",
      clientName: "Bidlow",
      email: "alex@bidlow.co.uk",
    });
    expect(prismaMock.suppressedEmail.upsert).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("skips the contact update when contactId is null", async () => {
    const raw = generateRawUnsubscribeToken();
    prismaMock.unsubscribeToken.findUnique.mockResolvedValueOnce({
      id: "tok-1",
      clientId: "c1",
      contactId: null,
      outboundEmailId: null,
      email: "alex@bidlow.co.uk",
      emailDomain: "bidlow.co.uk",
      usedAt: null,
      createdAt: new Date(),
      client: { name: "Bidlow" },
    });

    const result = await performUnsubscribe(raw);

    expect(result.status).toBe("unsubscribed");
    expect(prismaMock.contact.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.suppressedEmail.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
