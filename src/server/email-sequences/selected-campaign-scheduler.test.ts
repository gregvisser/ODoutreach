import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ queue: vi.fn(), client: vi.fn(), plan: vi.fn(), mailboxes: vi.fn(), sync: vi.fn(), advance: vi.fn() }));
vi.mock("@/server/email/outbound/queue-processor", () => ({ processOutboundSendQueue: mocks.queue }));
vi.mock("@/lib/db", () => ({ prisma: { client: { findFirst: mocks.client } } }));
vi.mock("@/server/mailbox/scheduled-outreach", () => ({ loadScheduledOutreachPlan: mocks.plan }));
vi.mock("@/server/mailbox/mailbox-inbox-sync", () => ({ listReplySyncMailboxIds: mocks.mailboxes, syncMailboxInboxForMailbox: mocks.sync }));
vi.mock("@/server/email-sequences/advance-due-followups", () => ({ advanceDueSequenceFollowUps: mocks.advance }));
import { runSelectedCampaignFollowUps } from "./selected-campaign-scheduler";
const selected = JSON.stringify({ clientId: "client-a", sequenceIds: ["campaign-a"] });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.queue.mockResolvedValue({ errors: [] });
  mocks.client.mockResolvedValue({ id: "client-a" });
  mocks.plan.mockResolvedValue({ clientIds: ["client-a"] });
  mocks.mailboxes.mockResolvedValue(["mailbox-a"]);
  mocks.sync.mockResolvedValue({ ok: true, backlogPending: false });
  mocks.advance.mockResolvedValue({ errors: [], followUpsQueued: 0 });
});
it("does nothing when not configured", async () => {
  expect(await runSelectedCampaignFollowUps(undefined)).toMatchObject({ skipped: true });
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.advance).not.toHaveBeenCalled();
});
it.each([{ ok: false }, { ok: true, backlogPending: true }])("does not advance after incomplete reply sync %j", async result => {
  mocks.sync.mockResolvedValue(result);
  expect(await runSelectedCampaignFollowUps(selected)).toMatchObject({ ok: false, reason: "reply-sync-incomplete" });
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("rechecks the window after reply sync", async () => {
  mocks.plan.mockResolvedValueOnce({ clientIds: ["client-a"] }).mockResolvedValueOnce({ clientIds: [] });
  expect(await runSelectedCampaignFollowUps(selected)).toMatchObject({ reason: "sending-window-closed" });
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("passes only the exact selected campaign after receiving succeeds", async () => {
  await runSelectedCampaignFollowUps(selected);
  expect(mocks.mailboxes).toHaveBeenCalledWith(["client-a"]);
  expect(mocks.sync).toHaveBeenCalledWith({ clientId: "client-a", mailboxIdentityId: "mailbox-a", staffUserId: null, top: 10 });
  expect(mocks.advance).toHaveBeenCalledExactlyOnceWith({ clientId: "client-a", sequenceIds: ["campaign-a"], onQueued: expect.any(Function) });
  expect(mocks.sync.mock.invocationCallOrder[0]).toBeLessThan(mocks.advance.mock.invocationCallOrder[0]);
});
it("refuses an empty receiving plan", async () => {
  mocks.mailboxes.mockResolvedValue([]);
  expect(await runSelectedCampaignFollowUps(selected)).toMatchObject({ ok: false });
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("does not touch providers outside the selected client's window", async () => {
  mocks.plan.mockResolvedValue({ clientIds: ["other-client"] });
  expect(await runSelectedCampaignFollowUps(selected)).toMatchObject({ skipped: true });
  expect(mocks.sync).not.toHaveBeenCalled();
});

it("does not contact providers without client consent", async () => {
  mocks.client.mockResolvedValue(null);
  expect(await runSelectedCampaignFollowUps(selected)).toMatchObject({ reason: "client-consent-unavailable" });
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("does not advance when receiving used the time budget", async () => {
  const now = vi.spyOn(Date, "now");
  now.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(90_001);
  try {
    expect(await runSelectedCampaignFollowUps(selected)).toMatchObject({ reason: "receiving-budget-exhausted" });
    expect(mocks.advance).not.toHaveBeenCalled();
  } finally { now.mockRestore(); }
});

it("drains only newly queued IDs for the selected client", async () => {
  mocks.advance.mockImplementation(async ({ onQueued }) => {
    await onQueued("client-a", ["new-a", "new-b"]);
    return { errors: [] };
  });
  await runSelectedCampaignFollowUps(selected);
  expect(mocks.queue).toHaveBeenCalledExactlyOnceWith({ limit: 25, dispatchScope: { clientId: "client-a", outboundEmailIds: ["new-a", "new-b"] } });
});
