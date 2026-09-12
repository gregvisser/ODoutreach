import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ sequence: vi.fn(), client: vi.fn(), mailboxes: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { clientEmailSequence: { findFirst: m.sequence }, client: { findUniqueOrThrow: m.client }, clientMailboxIdentity: { findMany: m.mailboxes } } }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: vi.fn() }));
vi.mock("@/server/mailbox/sending-policy", () => ({ eligibleWorkspaceMailboxPool: (rows: unknown[]) => rows }));
vi.mock("@/server/email-sequences/send-introduction", () => ({ buildSenderRow: () => ({ sender_name: "Synthetic", sender_company_name: "Synthetic" }) }));
import { loadOutreachEmailPreview } from "./pre-send-preview";
const input = { staff: {} as never, clientId: "client", sequenceId: "sequence", category: "INTRODUCTION" as const };
const client = { id: "client", name: "Synthetic", defaultSenderEmail: "sender@example.test", outreachLinkDomain: null, outreachLinkDomainVerifiedAt: null, onboarding: null };
beforeEach(() => {
  vi.stubEnv("PRE_SEND_PREVIEW_ENABLED", "true");
  vi.stubEnv("PUBLIC_APP_URL", "https://shared.example.test");
  m.sequence.mockResolvedValue({ id: "sequence", name: "Synthetic", launchPreferredMailboxId: "chosen", steps: [{ template: { subject: "Internal preview", content: "Test message" } }] });
  m.client.mockResolvedValue(client);
  m.mailboxes.mockResolvedValue([
    { id: "first", provider: "MICROSOFT", email: "first@example.test", displayName: "First", senderSignatureText: "First signature" },
    { id: "chosen", provider: "MICROSOFT", email: "chosen@example.test", displayName: "Chosen", senderSignatureText: "Chosen signature" },
  ]);
});
afterEach(() => vi.unstubAllEnvs());
it("renders the chosen sender and mailto footer instead of the shared app host", async () => {
  const result = await loadOutreachEmailPreview(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error);
  expect(result.preview.mailboxLabel).toContain("chosen@example.test");
  expect(result.preview.html).toContain("mailto:sender@example.test");
  expect(result.preview.html).not.toContain("/unsubscribe/PREVIEW-SAMPLE-TOKEN");
  expect(result.preview.html).not.toContain("First signature");
});
it("uses a verified client domain for the sample hosted unsubscribe link", async () => {
  m.client.mockResolvedValue({ ...client, outreachLinkDomain: "go.example.test", outreachLinkDomainVerifiedAt: new Date() });
  const result = await loadOutreachEmailPreview(input);
  if (!result.ok) throw Error(result.error);
  expect(result.preview.html).toContain("https://go.example.test/unsubscribe/PREVIEW-SAMPLE-TOKEN");
});
it("does not use an unverified client domain", async () => {
  m.client.mockResolvedValue({ ...client, outreachLinkDomain: "go.example.test" });
  const result = await loadOutreachEmailPreview(input);
  if (!result.ok) throw Error(result.error);
  expect(result.preview.html).not.toContain("go.example.test");
});
it("refuses an unavailable chosen mailbox instead of silently previewing another sender", async () => {
  m.mailboxes.mockResolvedValue([{ id: "first", email: "first@example.test" }]);
  expect(await loadOutreachEmailPreview(input)).toMatchObject({ ok: false, error: expect.stringContaining("chosen mailbox is unavailable") });
});

