import "server-only";

import { AI_MODELS } from "@/lib/ai/model-catalog";
import {
  buildSequenceDraftingInput,
  parseSequenceDraftToolUse,
  SEQUENCE_DRAFTING_SYSTEM_PROMPT,
  SEQUENCE_DRAFTING_TOOL,
  SEQUENCE_STEP_CATEGORIES,
  type DraftedSequenceStep,
  type SequenceDraftBrief,
} from "@/lib/ai/sequence-drafting";
import { prisma } from "@/lib/db";
import { TEMPLATE_CATEGORY_LABELS } from "@/lib/email-templates/template-policy";
import { logger } from "@/lib/logger";

import { callAnthropicMessages } from "./anthropic-messages";
import { runMeteredAiCall } from "./metered-call";

/**
 * Draft a whole outreach sequence for one client, and record what it cost.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE, and it is the whole reason the drafts
 * are not written through `createEmailTemplate`:
 *
 *   AN AI-DRAFTED EMAIL IS STILL AN EMAIL. IT IS NEVER APPROVED BY A MACHINE.
 *
 * `createEmailTemplate` auto-approves anything that passes `canApproveTemplate`
 * — which well-formed model output passes trivially — and an APPROVED template
 * is exactly what becomes eligible for a sequence, and therefore sendable. So
 * reusing it would take copy no human had read and put it one launch away from
 * a stranger's inbox. These rows are written DRAFT, with no approver and no
 * approval time, and the existing approval gate stands unchanged between them
 * and any mailbox.
 *
 * What this function deliberately does NOT do:
 *   * It does not build a `ClientEmailSequence`, choose a contact list, enrol
 *     anybody, or schedule anything. It produces five drafts a person edits and
 *     approves; assembling them into a live sequence is the existing flow.
 *   * It does not overwrite. A re-run adds a new set of drafts rather than
 *     replacing copy someone may already have edited.
 *   * It does not retry. A timed-out call may already have been served and
 *     billed, so an automatic retry would charge the client twice.
 */

/**
 * Five short emails plus tool overhead. Caps the output side of the bill: this
 * is the one AI call in the product a person triggers on demand, so it is the
 * one where a runaway generation would be most visible on an invoice.
 */
const MAX_OUTPUT_TOKENS = 4_000;

export type DraftSequenceResult =
  | {
      readonly ok: true;
      readonly templateIds: readonly string[];
      readonly steps: readonly DraftedSequenceStep[];
      readonly unknownPlaceholders: readonly string[];
      readonly costMicroUsd: number;
    }
  | { readonly ok: false; readonly reason: string };

/** Read the client's brief into the shape the prompt builder wants. */
async function loadBrief(clientId: string): Promise<
  | { client: { id: string; slug: string }; brief: SequenceDraftBrief }
  | null
> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      industry: true,
      website: true,
      notes: true,
      briefTaxonomyLinks: {
        select: { term: { select: { kind: true, displayValue: true } } },
      },
    },
  });
  if (!client) return null;

  const byKind = (kind: string): string[] =>
    client.briefTaxonomyLinks
      .filter((link) => link.term.kind === kind)
      .map((link) => link.term.displayValue);

  return {
    client: { id: client.id, slug: client.slug },
    brief: {
      clientName: client.name,
      industry: client.industry,
      website: client.website,
      notes: client.notes,
      serviceAreas: byKind("SERVICE_AREA"),
      targetIndustries: byKind("TARGET_INDUSTRY"),
      targetJobTitles: byKind("JOB_TITLE"),
      companySizes: byKind("COMPANY_SIZE"),
    },
  };
}

/** Name a drafted template so a person can tell one run from another. */
export function draftTemplateName(
  step: DraftedSequenceStep,
  stampedAt: Date,
): string {
  const date = stampedAt.toISOString().slice(0, 10);
  return `${TEMPLATE_CATEGORY_LABELS[step.category]} — AI draft ${date} (day ${step.absoluteDay})`;
}

export async function draftSequenceForClient(args: {
  clientId: string;
  staffUserId: string;
  /** Injectable so a test can pin the name stamp. */
  now?: Date;
}): Promise<DraftSequenceResult> {
  const loaded = await loadBrief(args.clientId);
  if (!loaded) return { ok: false, reason: "client_not_found" };

  const model = AI_MODELS.SEQUENCE_DRAFTING;

  const outcome = await runMeteredAiCall({
    client: loaded.client,
    feature: "SEQUENCE_DRAFTING",
    model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    subject: { type: "Client", id: loaded.client.id },
    invoke: async () => {
      const response = await callAnthropicMessages({
        apiKey: process.env.ANTHROPIC_API_KEY as string,
        model,
        system: SEQUENCE_DRAFTING_SYSTEM_PROMPT,
        userText: buildSequenceDraftingInput(loaded.brief),
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: SEQUENCE_DRAFTING_TOOL,
      });
      return {
        result: parseSequenceDraftToolUse(response.content),
        // Reported even when the answer was unusable: the tokens were spent
        // either way, and an unbilled call is the failure the ledger exists
        // to prevent.
        usage: {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
      };
    },
  });

  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  const parsed = outcome.result;
  if (!parsed) {
    logger.warn(
      { scope: "ai.draft-sequence", clientSlug: loaded.client.slug },
      "Sequence drafting returned an unusable answer; nothing was written",
    );
    return { ok: false, reason: "unusable_answer" };
  }

  const stampedAt = args.now ?? new Date();

  /**
   * Written in one transaction so a half-written sequence cannot exist. Five
   * drafts where the third failed would look, on the templates screen, exactly
   * like a sequence someone had already started editing.
   */
  const created = await prisma.$transaction(
    parsed.steps.map((step) =>
      prisma.clientEmailTemplate.create({
        data: {
          clientId: loaded.client.id,
          name: draftTemplateName(step, stampedAt),
          category: step.category,
          subject: step.subject,
          content: step.body,
          createdByStaffUserId: args.staffUserId,
          // NOT NEGOTIABLE, and asserted by test. A machine does not approve
          // its own copy, and these three fields are what stand between an AI
          // draft and a real recipient.
          status: "DRAFT",
          approvedByStaffUserId: null,
          approvedAt: null,
        },
        select: { id: true },
      }),
    ),
  );

  logger.info(
    {
      scope: "ai.draft-sequence",
      clientSlug: loaded.client.slug,
      drafted: created.length,
      costMicroUsd: outcome.costMicroUsd,
      unknownPlaceholders: parsed.unknownPlaceholders.length,
    },
    "Drafted an outreach sequence",
  );

  return {
    ok: true,
    templateIds: created.map((row) => row.id),
    steps: parsed.steps,
    unknownPlaceholders: parsed.unknownPlaceholders,
    costMicroUsd: outcome.costMicroUsd,
  };
}

/** How many templates one run writes. Used by the screen's copy. */
export const DRAFTS_PER_RUN = SEQUENCE_STEP_CATEGORIES.length;
