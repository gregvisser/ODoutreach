import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn(), access: vi.fn(), mutate: vi.fn(), add: vi.fn(), decide: vi.fn(), refresh: vi.fn(), evaluate: vi.fn(), retry: vi.fn(), contact: vi.fn(), outbound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: m.staff }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: m.access }));
vi.mock("@/server/email-sequences/mutator-access", () => ({ getClientEmailSequenceMutationAllowed: m.mutate }));
vi.mock("@/server/suppression/company-names", () => ({ addCompanyNames: m.add, decideCompanyName: m.decide }));
vi.mock("@/server/outreach/suppression-guard", () => ({ evaluateSuppression: m.evaluate, refreshContactSuppressionFlagsForClient: m.refresh }));
vi.mock("@/server/email/outbound/operator-recovery", () => ({ operatorRequeueFailedSend: m.retry }));
vi.mock("@/lib/db", () => ({ prisma: { contact: { findFirst: m.contact }, outboundEmail: { findFirst: m.outbound } } }));
import { importCompanyDncAction, reviewCompanyDncAction, retryCompanyDncHoldAction } from "./company-dnc-actions";
const importInput = { clientId: "client", text: "Acme", format: "text" as const };
const reviewInput = { clientId: "client", contactId: "contact", company: "Acme Group", entryId: "entry", outcome: "ALLOW" as const };
beforeEach(() => {
  vi.resetAllMocks(); m.staff.mockResolvedValue({ id: "staff", isSuperAdmin: false }); m.access.mockResolvedValue(undefined); m.mutate.mockResolvedValue(true);
  m.add.mockResolvedValue({ ok: true, added: 1, duplicates: 0 }); m.decide.mockResolvedValue({ ok: true }); m.contact.mockResolvedValue({ id: "contact" });
  m.outbound.mockResolvedValue({ toEmail: "recipient@example.test" }); m.evaluate.mockResolvedValue({ suppressed: false }); m.retry.mockResolvedValue({ count: 1 });
});
it.each(["access", "mutate"] as const)("rejects unauthorised %s before any mutation", async gate => {
  if (gate === "access") m.access.mockRejectedValue(Error("Denied")); else m.mutate.mockResolvedValue(false);
  expect(await importCompanyDncAction(importInput)).toMatchObject({ ok: false });
  expect(await reviewCompanyDncAction(reviewInput)).toMatchObject({ ok: false });
  expect(await retryCompanyDncHoldAction({ clientId: "client", outboundEmailId: "outbound" })).toMatchObject({ ok: false });
  expect(m.add).not.toHaveBeenCalled(); expect(m.decide).not.toHaveBeenCalled(); expect(m.retry).not.toHaveBeenCalled();
});
it("permits an authorised ordinary staff import", async () => {
  expect(await importCompanyDncAction(importInput)).toMatchObject({ ok: true });
  expect(m.add).toHaveBeenCalledWith({ ...importInput, staffUserId: "staff" });
});
it("rejects a review of a changed or foreign contact", async () => {
  m.contact.mockResolvedValue(null);
  expect(await reviewCompanyDncAction(reviewInput)).toMatchObject({ ok: false });
  expect(m.contact).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contact", clientId: "client", company: "Acme Group" } }));
  expect(m.decide).not.toHaveBeenCalled();
});
it("does not queue a still-blocked recipient", async () => {
  m.evaluate.mockResolvedValue({ suppressed: true });
  expect(await retryCompanyDncHoldAction({ clientId: "client", outboundEmailId: "outbound" })).toMatchObject({ ok: false });
  expect(m.retry).not.toHaveBeenCalled();
});
it("restricts staff retry to the company-review failure under the recovery lock", async () => {
  expect(await retryCompanyDncHoldAction({ clientId: "client", outboundEmailId: "outbound" })).toMatchObject({ ok: true });
  expect(m.retry).toHaveBeenCalledWith("outbound", "client", "COMPANY_REVIEW");
});
it("reports saved protection honestly if refreshing cached contact labels fails", async () => {
  m.refresh.mockRejectedValue(Error("Synthetic interruption"));
  expect(await importCompanyDncAction(importInput)).toMatchObject({ ok: true, message: expect.stringContaining("list is saved") });
});
