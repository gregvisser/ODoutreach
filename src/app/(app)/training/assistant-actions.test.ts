import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireOpensDoorsStaff,
  createSupportTicket,
  answerTrainingQuestion,
  updateUnanswered,
  reportErrorMock,
} = vi.hoisted(() => ({
  requireOpensDoorsStaff: vi.fn(),
  createSupportTicket: vi.fn(),
  answerTrainingQuestion: vi.fn(),
  updateUnanswered: vi.fn(),
  reportErrorMock: vi.fn(),
}));

vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff }));
vi.mock("@/app/(app)/support/actions", () => ({ createSupportTicket }));
vi.mock("@/server/ai/answer-training-question", () => ({ answerTrainingQuestion }));
vi.mock("@/lib/db", () => ({
  prisma: { trainingAssistantUnansweredQuestion: { update: updateUnanswered } },
}));
vi.mock("@/lib/logger", () => ({ reportError: reportErrorMock }));

import {
  askTrainingAssistantAction,
  raiseTrainingAssistantTicketAction,
} from "./assistant-actions";

const staff = { id: "staff-1", email: "staff@opensdoors.co.uk" };

beforeEach(() => {
  vi.clearAllMocks();
  requireOpensDoorsStaff.mockResolvedValue(staff);
});

describe("askTrainingAssistantAction", () => {
  it("rejects an unauthenticated caller before ever reaching the assistant", async () => {
    requireOpensDoorsStaff.mockRejectedValue(new Error("Unauthorized"));

    const out = await askTrainingAssistantAction("How do I connect a mailbox?");

    expect(out).toEqual({ ok: false, reason: "unauthorized" });
    expect(answerTrainingQuestion).not.toHaveBeenCalled();
  });

  it("passes the trimmed question and the asker's email through to the assistant", async () => {
    answerTrainingQuestion.mockResolvedValue({ ok: true, canAnswer: false, unansweredQuestionId: "u1" });

    await askTrainingAssistantAction("  How do I connect a mailbox?  ");

    expect(answerTrainingQuestion).toHaveBeenCalledWith({
      question: "How do I connect a mailbox?",
      askedByEmail: staff.email,
    });
  });
});

describe("raiseTrainingAssistantTicketAction — the do-not-know fallback", () => {
  it("creates a REAL support ticket carrying the question, via the shared ticket-creation path", async () => {
    createSupportTicket.mockResolvedValue({ ok: true, ticketId: "ticket-1" });

    const out = await raiseTrainingAssistantTicketAction({
      question: "How do I bulk-export a client's suppression list to CSV?",
      unansweredQuestionId: "unanswered-1",
    });

    expect(out).toEqual({ ok: true, ticketId: "ticket-1" });
    expect(createSupportTicket).toHaveBeenCalledTimes(1);

    const formData = createSupportTicket.mock.calls[0][0] as FormData;
    expect(formData.get("title")).toContain("How do I bulk-export");
    expect(formData.get("description")).toContain(
      "How do I bulk-export a client's suppression list to CSV?",
    );

    // Links the ticket back to the unanswered-question record so the backlog stays traceable.
    expect(updateUnanswered).toHaveBeenCalledWith({
      where: { id: "unanswered-1" },
      data: { raisedSupportTicketId: "ticket-1" },
    });
  });

  it("still returns the ticket id when the question is too short to link, and reports the linking failure", async () => {
    createSupportTicket.mockResolvedValue({ ok: true, ticketId: "ticket-2" });
    updateUnanswered.mockRejectedValue(new Error("db down"));

    const out = await raiseTrainingAssistantTicketAction({
      question: "Where is the branded signature button?",
      unansweredQuestionId: "unanswered-2",
    });

    expect(out).toEqual({ ok: true, ticketId: "ticket-2" });
    expect(reportErrorMock).toHaveBeenCalled();
  });

  it("surfaces the underlying ticket-creation error rather than inventing its own", async () => {
    createSupportTicket.mockResolvedValue({ ok: false, error: "Give the ticket a short title" });

    const out = await raiseTrainingAssistantTicketAction({
      question: "How do I do the thing on the screen?",
    });

    expect(out).toEqual({ ok: false, error: "Give the ticket a short title" });
  });

  it("rejects an unauthenticated caller before creating a ticket", async () => {
    requireOpensDoorsStaff.mockRejectedValue(new Error("Unauthorized"));

    const out = await raiseTrainingAssistantTicketAction({ question: "How do I do X?" });

    expect(out.ok).toBe(false);
    expect(createSupportTicket).not.toHaveBeenCalled();
  });
});
