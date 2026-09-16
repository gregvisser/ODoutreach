import { beforeEach, expect, it, vi } from "vitest";

const { staff, access, sync, revalidate, report } = vi.hoisted(() => ({
  staff: vi.fn(), access: vi.fn(), sync: vi.fn(), revalidate: vi.fn(), report: vi.fn(),
}));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: staff }));
vi.mock("@/server/mailbox-identities/mutator-access", () => ({ requireClientMailboxMutator: access }));
vi.mock("@/server/mailbox/mailbox-inbox-sync", () => ({ syncMailboxInboxForMailbox: sync }));
vi.mock("@/lib/logger", () => ({ reportError: report }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
import { syncMailboxInboxForMailboxAction } from "./mailbox-inbox-actions";

beforeEach(() => {
  vi.resetAllMocks();
  staff.mockResolvedValue({ id: "staff" });
  access.mockResolvedValue(undefined);
});

it("returns known partial results inline and refreshes recovered replies", async () => {
  const partial = { ok: false, error: "Checked 1 of 2 messages. Historical duplicates need review." };
  sync.mockResolvedValue(partial);
  expect(await syncMailboxInboxForMailboxAction("client", "mailbox")).toEqual(partial);
  expect(revalidate).toHaveBeenCalledWith("/replies");
  expect(revalidate).toHaveBeenCalledWith("/clients/client/mailboxes");
  expect(report).not.toHaveBeenCalled();
});

it("contains unexpected sync failures without exposing raw error text or retrying", async () => {
  const error = new Error("Database failure with private mailbox details");
  sync.mockRejectedValue(error);
  const result = await syncMailboxInboxForMailboxAction("client", "mailbox");
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Reply checking could not finish") });
  expect(JSON.stringify(result)).not.toContain(error.message);
  expect(sync).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(error, { operation: "manual_mailbox_reply_sync", clientId: "client", mailboxId: "mailbox" });
  expect(revalidate).toHaveBeenCalledWith("/replies");
});

it("does not sync or refresh a workspace when mutation access is denied", async () => {
  access.mockRejectedValue(new Error("Forbidden"));
  expect(await syncMailboxInboxForMailboxAction("client", "mailbox")).toEqual({ ok: false, error: "Forbidden" });
  expect(sync).not.toHaveBeenCalled();
  expect(revalidate).not.toHaveBeenCalled();
});

it("keeps successful counts and backlog status", async () => {
  sync.mockResolvedValue({ ok: true, ingested: 5, totalSeen: 6, backlogPending: true, repliesLinked: 1 });
  expect(await syncMailboxInboxForMailboxAction("client", "mailbox")).toEqual({
    ok: true, ingested: 5, totalSeen: 6, backlogPending: true,
  });
});
