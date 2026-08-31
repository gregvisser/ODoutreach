"use server";

import { createSupportTicket } from "@/app/(app)/support/actions";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/logger";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  answerTrainingQuestion,
  type AnswerTrainingQuestionResult,
} from "@/server/ai/answer-training-question";

const MAX_QUESTION_CHARS = 500;

export type AskTrainingAssistantResult =
  | AnswerTrainingQuestionResult
  | { readonly ok: false; readonly reason: "unauthorized" };

/** The app-shell search bar's only entry point into the model. Staff-only. */
export async function askTrainingAssistantAction(
  question: string,
): Promise<AskTrainingAssistantResult> {
  const staff = await requireOpensDoorsStaff().catch(() => null);
  if (!staff) return { ok: false, reason: "unauthorized" };

  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed) return { ok: false, reason: "empty_question" };

  return answerTrainingQuestion({ question: trimmed, askedByEmail: staff.email });
}

export type RaiseTrainingAssistantTicketResult =
  | { readonly ok: true; readonly ticketId: string }
  | { readonly ok: false; readonly error: string };

/**
 * The "raise a support ticket" fallback when the assistant cannot answer.
 * Reuses `createSupportTicket` rather than writing to `SupportTicket`
 * directly, so this stays the one place a ticket gets created and every
 * ticket-creation rule (title/description length, priority) applies here too.
 */
export async function raiseTrainingAssistantTicketAction(args: {
  question: string;
  unansweredQuestionId?: string;
}): Promise<RaiseTrainingAssistantTicketResult> {
  const staff = await requireOpensDoorsStaff().catch(() => null);
  if (!staff) return { ok: false, error: "You need to be signed in to raise a ticket." };

  const question = args.question.trim();
  if (question.length < 3) {
    return { ok: false, error: "The question is too short to raise as a ticket." };
  }

  const formData = new FormData();
  formData.set("title", `Training assistant could not answer: ${question.slice(0, 80)}`);
  formData.set(
    "description",
    `Raised automatically from the app-shell "how do I..." search bar.\n\nQuestion asked:\n${question}`,
  );
  formData.set("priority", "LOW");

  const result = await createSupportTicket(formData);
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.ticketId) {
    return { ok: false, error: "The ticket was not created — please try again." };
  }

  if (args.unansweredQuestionId) {
    try {
      await prisma.trainingAssistantUnansweredQuestion.update({
        where: { id: args.unansweredQuestionId },
        data: { raisedSupportTicketId: result.ticketId },
      });
    } catch (err) {
      // The ticket is real and already created — losing this link loses
      // traceability, not the ticket itself, so it is reported, not thrown.
      reportError(err, {
        scope: "training-assistant.ticket-link",
        detail: "Ticket created but could not be linked back to the unanswered question",
        unansweredQuestionId: args.unansweredQuestionId,
        ticketId: result.ticketId,
      });
    }
  }

  return { ok: true, ticketId: result.ticketId };
}
