import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

import { executeOutboundSend } from "./execute-one";

/**
 * Integration coverage for the outbound DISPATCHER — the one module in the send
 * pipeline that genuinely can deliver mail.
 *
 * SAFETY, in three independent layers:
 *
 *  1. `fetch` is stubbed to throw. Any HTTP attempt from any code path fails the
 *     test loudly instead of sending. This is the backstop that does not depend
 *     on knowing every transport.
 *  2. Both mailbox transports (Gmail, Microsoft Graph) and their token getters
 *     are mocked, so the real implementations are never reachable.
 *  3. `vitest.integration.config.ts` sets EMAIL_PROVIDER=mock and blanks every
 *     provider credential, so the legacy path selects the inert MockEmailProvider
 *     and a real transport would fail closed even if one were selected.
 *
 * Most assertions below deliberately target guards that return BEFORE any
 * transport is consulted — already-sent, wrong status, suppression, invalid
 * payload. Those are both the highest-value rules and provably send-free.
 */

const gmailSend = vi.fn();
const graphSend = vi.fn();
const graphMimeSend = vi.fn();

vi.mock("@/server/mailbox/gmail-sendmail", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/mailbox/gmail-sendmail")
  >();
  return {
    ...actual,
    sendGmailUsersMessagesSend: (...args: unknown[]) => gmailSend(...args),
    findGmailMessageIdByRfc822MessageId: vi.fn(async () => null),
  };
});

vi.mock("@/server/mailbox/microsoft-graph-sendmail", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/mailbox/microsoft-graph-sendmail")
  >();
  return {
    ...actual,
    sendMicrosoftGraphSendMail: (...args: unknown[]) => graphSend(...args),
    sendMicrosoftGraphMimeSendMail: (...args: unknown[]) => graphMimeSend(...args),
    findGraphSentMessageId: vi.fn(async () => null),
  };
});

vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: vi.fn(async () => ({
    ok: false as const,
    error: "test-no-token",
  })),
}));

vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({
  getMicrosoftGraphAccessTokenForMailbox: vi.fn(async () => ({
    ok: false as const,
    error: "test-no-token",
  })),
}));

const CLIENT_ID = "itest-disp-client";

/** Creates a dispatchable row: PROCESSING, with subject and body present. */
async function makeOutbound(
  id: string,
  overrides: Partial<{
    status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "BLOCKED_SUPPRESSION";
    providerMessageId: string | null;
    subject: string | null;
    bodySnapshot: string | null;
    toEmail: string;
    clientId: string;
  }> = {},
): Promise<string> {
  await prisma.outboundEmail.create({
    data: {
      id,
      clientId: overrides.clientId ?? CLIENT_ID,
      toEmail: overrides.toEmail ?? "recipient@example.test",
      subject: overrides.subject === undefined ? "Hello there" : overrides.subject,
      bodySnapshot:
        overrides.bodySnapshot === undefined ? "Body copy" : overrides.bodySnapshot,
      status: overrides.status ?? "PROCESSING",
      providerMessageId: overrides.providerMessageId ?? null,
      claimedAt: new Date(),
      claimExpiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  return id;
}

async function seedClient(): Promise<void> {
  await prisma.client.create({
    data: {
      id: CLIENT_ID,
      name: "Dispatcher Workspace",
      slug: "dispatcher-workspace",
      status: "ACTIVE",
      defaultSenderEmail: "sender@example.test",
    },
  });
}

function rowById(id: string) {
  return prisma.outboundEmail.findUniqueOrThrow({ where: { id } });
}

beforeEach(async () => {
  gmailSend.mockReset();
  graphSend.mockReset();
  graphMimeSend.mockReset();

  // Layer 1 — the network is closed. Any real transport attempt throws here.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NETWORK BLOCKED: a test attempted a real HTTP request");
    }),
  );

  await resetIntegrationDatabase();
  await seedClient();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.$disconnect();
  await closeIntegrationPool();
});

/** No transport may have been invoked. Used by every guard test. */
function expectNothingSent(): void {
  expect(gmailSend).not.toHaveBeenCalled();
  expect(graphSend).not.toHaveBeenCalled();
  expect(graphMimeSend).not.toHaveBeenCalled();
}

describe("executeOutboundSend — rows it must refuse to send", () => {
  it("reports an unknown outbound id without sending", async () => {
    const result = await executeOutboundSend("does-not-exist");

    expect(result).toEqual({ ok: false, error: "Outbound not found" });
    expectNothingSent();
  });

  it("treats a row that already has a provider message id as done", async () => {
    // The idempotency guard: a row the provider already accepted must never be
    // sent a second time, whatever its status says.
    const id = await makeOutbound("ob-already", {
      providerMessageId: "provider-123",
    });

    expect(await executeOutboundSend(id)).toEqual({ ok: true });
    expectNothingSent();
  });

  it.each(["QUEUED", "SENT", "FAILED", "BLOCKED_SUPPRESSION"] as const)(
    "does not dispatch a row in %s status",
    async (status) => {
      // Only a PROCESSING row (claimed by a worker) may be dispatched.
      const id = await makeOutbound(`ob-${status}`, { status });

      expect(await executeOutboundSend(id)).toEqual({ ok: true });
      expectNothingSent();
    },
  );

  it("fails a row with no subject", async () => {
    const id = await makeOutbound("ob-nosubject", { subject: null });

    const result = await executeOutboundSend(id);

    expect(result).toEqual({ ok: false, error: "Invalid payload" });
    expect((await rowById(id)).status).toBe("FAILED");
    expectNothingSent();
  });

  it("fails a row with no body snapshot", async () => {
    const id = await makeOutbound("ob-nobody", { bodySnapshot: null });

    const result = await executeOutboundSend(id);

    expect(result).toEqual({ ok: false, error: "Invalid payload" });
    expect((await rowById(id)).status).toBe("FAILED");
    expectNothingSent();
  });

  it("records the failure reason on an invalid payload", async () => {
    const id = await makeOutbound("ob-nosubject2", { subject: null });

    await executeOutboundSend(id);

    const row = await rowById(id);
    expect(row.lastErrorCode).toBe("INVALID_PAYLOAD");
    expect(row.lastErrorMessage).toContain("Missing subject or body");
  });
});

describe("executeOutboundSend — suppression at dispatch time", () => {
  /** Suppresses an address for the workspace. Lookup is by normalized email. */
  async function suppress(email: string, clientId = CLIENT_ID): Promise<void> {
    await prisma.suppressedEmail.create({
      data: { clientId, email: email.trim().toLowerCase() },
    });
  }

  it("blocks a send to an address suppressed after the row was queued", async () => {
    // The rule that matters most in this module: suppression is re-checked at
    // dispatch, not just when the row was staged.
    await suppress("blocked@example.test");
    const id = await makeOutbound("ob-suppressed", {
      toEmail: "blocked@example.test",
    });

    expect(await executeOutboundSend(id)).toEqual({ ok: true });

    const row = await rowById(id);
    expect(row.status).toBe("BLOCKED_SUPPRESSION");
    expect(row.lastErrorCode).toBe("SUPPRESSED");
    expect(row.providerMessageId).toBeNull();
    expectNothingSent();
  });

  it("records a suppression snapshot for audit", async () => {
    await suppress("blocked@example.test");
    const id = await makeOutbound("ob-suppressed2", {
      toEmail: "blocked@example.test",
    });

    await executeOutboundSend(id);

    expect((await rowById(id)).suppressionSnapshot).not.toBeNull();
  });

  it("matches the suppressed address case-insensitively", async () => {
    await suppress("blocked@example.test");
    const id = await makeOutbound("ob-suppressed3", {
      toEmail: "BLOCKED@Example.TEST",
    });

    await executeOutboundSend(id);

    expect((await rowById(id)).status).toBe("BLOCKED_SUPPRESSION");
    expectNothingSent();
  });

  it("clears the worker claim so a blocked row is not retried", async () => {
    await suppress("blocked@example.test");
    const id = await makeOutbound("ob-suppressed4", {
      toEmail: "blocked@example.test",
    });

    await executeOutboundSend(id);

    const row = await rowById(id);
    expect(row.claimedAt).toBeNull();
    expect(row.claimExpiresAt).toBeNull();
  });

  it("does not block an address suppressed in a different workspace", async () => {
    // Suppression is per-workspace; one client's opt-out must not silently
    // block another client's outreach.
    await prisma.client.create({
      data: { id: "other-client", name: "Other", slug: "disp-other", status: "ACTIVE" },
    });
    await suppress("elsewhere@example.test", "other-client");
    const id = await makeOutbound("ob-otherclient", {
      toEmail: "elsewhere@example.test",
    });

    await executeOutboundSend(id);

    expect((await rowById(id)).status).not.toBe("BLOCKED_SUPPRESSION");
  });
});

describe("executeOutboundSend — legacy provider path", () => {
  it("sends via the inert mock provider and records its message id", async () => {
    // EMAIL_PROVIDER=mock: deterministic, no network. Proves the success path
    // updates the row without any real delivery.
    const id = await makeOutbound("ob-mock");

    const result = await executeOutboundSend(id);

    expect(result.ok).toBe(true);
    const row = await rowById(id);
    expect(row.status).toBe("SENT");
    expect(row.providerName).toBe("mock");
    expect(row.providerMessageId).toMatch(/^mock_/);
    expect(row.sentAt).not.toBeNull();
    expectNothingSent();
  });

  it("is idempotent — a second dispatch does not re-send", async () => {
    const id = await makeOutbound("ob-mock-twice");

    await executeOutboundSend(id);
    const first = await rowById(id);
    const second = await executeOutboundSend(id);

    expect(second).toEqual({ ok: true });
    const after = await rowById(id);
    expect(after.providerMessageId).toBe(first.providerMessageId);
    expect(after.sentAt?.getTime()).toBe(first.sentAt?.getTime());
  });

  it("fails a row whose client no longer exists", async () => {
    const id = await makeOutbound("ob-noclient");
    await prisma.outboundEmail.update({
      where: { id },
      data: { clientId: CLIENT_ID },
    });
    // Remove the client, leaving the row orphaned via a raw delete cascade guard.
    await prisma.outboundEmail.update({ where: { id }, data: { contactId: null } });
    await prisma.client.delete({ where: { id: CLIENT_ID } });

    const result = await executeOutboundSend(id);

    expect(result.ok).toBe(false);
    expectNothingSent();
  });
});
