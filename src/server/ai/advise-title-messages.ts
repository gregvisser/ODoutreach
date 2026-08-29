import "server-only";

import { AI_MODELS } from "@/lib/ai/model-catalog";
import {
  buildTitleMessageInput,
  parseTitleMessageToolUse,
  TITLE_MESSAGE_PROMPT_VERSION,
  TITLE_MESSAGE_SYSTEM_PROMPT,
  TITLE_MESSAGE_TOOL,
  type TitleMessageFinding,
} from "@/lib/ai/title-message";
import {
  assessTitleMessageEvidence,
  TITLE_MESSAGE_LOOKBACK_DAYS,
  TITLE_MESSAGE_MATURITY_DAYS,
  type MessageIdentity,
  type TitleFamilyStat,
  type TitleMessageCoverage,
  type TitleMessageOutcome,
} from "@/lib/ai/title-message-evidence";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

import { callAnthropicMessages } from "./anthropic-messages";
import { runMeteredAiCall } from "./metered-call";

/**
 * Say which of a client's campaigns suits which kind of job title, and record
 * what it cost.
 *
 * WHAT THIS FUNCTION CHANGES: nothing. It reads enrollments and linked replies
 * and writes one `AiTitleMessageReview` row. It does not touch a template, a
 * campaign, a contact list, an enrollment, a queue row or anybody's targeting —
 * and it has no route to any of them. That is asserted by test.
 *
 * THE ORDER OF OPERATIONS IS THE SAFETY PROPERTY, as it was for the previous
 * five features. The table is built, the job titles are grouped and the
 * significance test is run BEFORE the model is called, so a client whose
 * campaigns cannot be told apart costs nothing at all. The threshold that test
 * uses rises with the number of comparisons being made, which matters more here
 * than anywhere else in this application: a dozen audiences at the conventional
 * bar would hand back a confident false winner on almost every press of the
 * button, and it would be indistinguishable from a real one.
 *
 * It also does not retry. A timed-out call may already have been served and
 * billed, so an automatic retry would charge the client twice.
 */

/** A paragraph, a few findings and some cautions. Caps the output side. */
const MAX_OUTPUT_TOKENS = 2_000;

/**
 * A lookup key for one (audience, campaign) cell.
 *
 * `JSON.stringify` of the pair rather than the two labels joined by a
 * separator, because both halves are free text a person typed. A campaign
 * called "Finance — Q3" and an audience called "Finance" would collide under
 * any printable separator, and a collision here would let a finding about a
 * pair the arithmetic called noise pass the filter below wearing another pair's
 * verdict.
 */
function pairKey(audienceLabel: string, messageLabel: string): string {
  return JSON.stringify([audienceLabel, messageLabel]);
}

export type AdviseTitleMessagesResult =
  | {
      readonly ok: true;
      readonly reviewId: string;
      readonly summary: string;
      readonly findings: readonly TitleMessageFinding[];
      readonly cautions: readonly string[];
      readonly anyDistinguishable: boolean;
      readonly costMicroUsd: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Read this client's matured enrollments, and what became of each one.
 *
 * ONE ROW PER PERSON PER CAMPAIGN, which is what makes the arithmetic
 * downstream legitimate — see the header of `title-message-evidence.ts` for why
 * counting sends instead would count one person up to five times and treat a
 * sequence that stops on reply as though it had not.
 *
 * TWO FILTERS, AND BOTH CHANGE THE ANSWER RATHER THAN TIDYING IT:
 *
 *   * An enrollment that never produced a SENT email is not counted at all.
 *     Somebody excluded by suppression, or still sitting in PENDING, was never
 *     given the chance to reply, and scoring them as "did not reply" would
 *     punish whichever campaign happened to be pointed at a dirtier list.
 *   * Enrollments newer than the maturity window are excluded, because those
 *     people are still being emailed.
 *
 * A reply is counted as `linkedOutboundEmailId` pointing at one of the
 * enrollment's sends — the same linkage the inbox and the reports already use.
 * Unlinked replies exist (Gmail rewrites Message-IDs, so the matcher cannot
 * always be certain) and are deliberately NOT counted: an unlinked reply has no
 * campaign to attribute, and spreading it would invent the difference we are
 * asking about. That under-counts every campaign, unevenly, and it is one of the
 * reasons the significance threshold sits where it does rather than lower.
 */
async function loadTitleMessageOutcomes(args: {
  clientId: string;
  since: Date;
  until: Date;
}): Promise<TitleMessageOutcome[]> {
  const rows = await prisma.clientEmailSequenceEnrollment.findMany({
    where: {
      clientId: args.clientId,
      enrolledAt: { gte: args.since, lte: args.until },
    },
    select: {
      sequenceId: true,
      contact: { select: { title: true } },
      stepSends: {
        select: {
          outboundEmail: {
            select: {
              sentAt: true,
              inboundReplies: { select: { classification: true } },
            },
          },
        },
      },
    },
  });

  const outcomes: TitleMessageOutcome[] = [];
  for (const row of rows) {
    const sends = row.stepSends
      .map((s) => s.outboundEmail)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Never emailed, so never given the chance to reply. Not a trial.
    if (!sends.some((e) => e.sentAt !== null)) continue;

    const replies = sends.flatMap((e) => e.inboundReplies);
    outcomes.push({
      sequenceId: row.sequenceId,
      title: row.contact.title,
      replied: replies.length > 0,
      positive: replies.some((r) => r.classification === "POSITIVE"),
    });
  }

  return outcomes;
}

async function loadMessageIdentities(clientId: string): Promise<MessageIdentity[]> {
  const rows = await prisma.clientEmailSequence.findMany({
    where: { clientId },
    select: { id: true, name: true },
  });

  return rows.map((row) => ({
    sequenceId: row.id,
    label: row.name.trim() || "Untitled campaign",
  }));
}

export async function adviseTitleMessages(args: {
  clientId: string;
  staffUserId: string;
  /** Injectable so the evidence window is testable at a fixed point. */
  now?: Date;
}): Promise<AdviseTitleMessagesResult> {
  const client = await prisma.client.findFirst({
    where: { id: args.clientId, deletedAt: null },
    select: { id: true, slug: true, name: true, industry: true },
  });
  if (!client) return { ok: false, reason: "client_not_found" };

  const now = args.now ?? new Date();
  const day = 24 * 60 * 60 * 1000;
  const since = new Date(now.getTime() - TITLE_MESSAGE_LOOKBACK_DAYS * day);
  const until = new Date(now.getTime() - TITLE_MESSAGE_MATURITY_DAYS * day);

  const [outcomes, messages] = await Promise.all([
    loadTitleMessageOutcomes({ clientId: client.id, since, until }),
    loadMessageIdentities(client.id),
  ]);
  const verdict = assessTitleMessageEvidence(outcomes, messages);

  // The gate. Fails closed BEFORE any money is spent: no call, no ledger row for
  // a call that did not happen, and a reason that names what is actually
  // missing so an operator knows whether to wait, import titles, or run a
  // second campaign at the same audience.
  if (!verdict.sufficient) {
    return { ok: false, reason: verdict.reason };
  }

  const model = AI_MODELS.TITLE_MESSAGE_FIT;

  const outcome = await runMeteredAiCall({
    client: { id: client.id, slug: client.slug },
    feature: "TITLE_MESSAGE_FIT",
    model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    subject: { type: "Client", id: client.id },
    invoke: async () => {
      const response = await callAnthropicMessages({
        apiKey: process.env.ANTHROPIC_API_KEY as string,
        model,
        system: TITLE_MESSAGE_SYSTEM_PROMPT,
        userText: buildTitleMessageInput({
          clientName: client.name,
          industry: client.industry,
          families: verdict.families,
          coverage: verdict.coverage,
          totalReplied: verdict.totalReplied,
          totalPositive: verdict.totalPositive,
          lookbackDays: TITLE_MESSAGE_LOOKBACK_DAYS,
          maturityDays: TITLE_MESSAGE_MATURITY_DAYS,
          comparisonCount: verdict.comparisonCount,
          anyDistinguishable: verdict.anyDistinguishable,
        }),
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: TITLE_MESSAGE_TOOL,
      });
      return {
        result: parseTitleMessageToolUse(response.content),
        // Reported even when the answer was unusable: the tokens were spent
        // either way, and an unbilled call is the failure the ledger exists to
        // prevent.
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
      { scope: "ai.advise-title-messages", clientSlug: client.slug },
      "Message-fit analysis returned an unusable answer; nothing was written",
    );
    return { ok: false, reason: "unusable_answer" };
  }

  /**
   * The last line of the guardrail, and the only one that survives a model
   * ignoring every instruction it was given.
   *
   * The prompt says not to explain a pair the table marked as within normal
   * variation, and the input says so again per row. If it does anyway, the
   * finding is dropped here: a paragraph asserting that one campaign suits one
   * audience, justified by a difference our own arithmetic says is not a
   * difference, is exactly the output this feature exists to prevent — and a
   * prompt is not a control.
   *
   * Matched on the (audience, campaign) label pair, because that is what the
   * model was given and what it echoes back. A finding naming a pair we cannot
   * find in the table is dropped too, since it cannot be checked against any
   * verdict.
   */
  const distinguishable = new Set<string>();
  for (const family of verdict.families) {
    for (const message of family.messages) {
      if (message.comparison.kind !== "indistinguishable") {
        distinguishable.add(pairKey(family.label, message.label));
      }
    }
  }
  const findings = parsed.findings.filter((finding) =>
    distinguishable.has(pairKey(finding.audienceLabel, finding.messageLabel)),
  );
  const droppedFindings = parsed.findings.length - findings.length;
  if (droppedFindings > 0) {
    logger.warn(
      {
        scope: "ai.advise-title-messages",
        clientSlug: client.slug,
        droppedFindings,
      },
      "Dropped AI findings about campaign/audience pairs that are within normal variation",
    );
  }

  const review = await prisma.aiTitleMessageReview.create({
    data: {
      clientId: client.id,
      summary: parsed.summary,
      findings: findings as unknown as object[],
      cautions: parsed.cautions as unknown as string[],
      // Stored with the explanation so the panel can print the numbers beside
      // the prose, and so an answer given on a thinner history stays auditable
      // once the history has grown past it.
      evidence: verdict.families as unknown as object[],
      coverage: verdict.coverage as unknown as object,
      totalReplied: verdict.totalReplied,
      totalPositive: verdict.totalPositive,
      lookbackDays: TITLE_MESSAGE_LOOKBACK_DAYS,
      comparisonCount: verdict.comparisonCount,
      // Integer milli-standard-errors: the threshold moved with the size of the
      // table, so a later reader cannot re-derive it from the verdicts alone.
      zThresholdMilli: Math.round(verdict.zThreshold * 1_000),
      anyDistinguishable: verdict.anyDistinguishable,
      model,
      promptVersion: TITLE_MESSAGE_PROMPT_VERSION,
      requestedByStaffUserId: args.staffUserId,
    },
    select: { id: true },
  });

  logger.info(
    {
      scope: "ai.advise-title-messages",
      clientSlug: client.slug,
      audiences: verdict.families.length,
      comparisons: verdict.comparisonCount,
      findings: findings.length,
      anyDistinguishable: verdict.anyDistinguishable,
      costMicroUsd: outcome.costMicroUsd,
    },
    "Compared campaigns by job title",
  );

  return {
    ok: true,
    reviewId: review.id,
    summary: parsed.summary,
    findings,
    cautions: parsed.cautions,
    anyDistinguishable: verdict.anyDistinguishable,
    costMicroUsd: outcome.costMicroUsd,
  };
}

export interface StoredTitleMessageReview {
  readonly id: string;
  readonly summary: string;
  readonly findings: readonly TitleMessageFinding[];
  readonly cautions: readonly string[];
  readonly evidence: readonly TitleFamilyStat[];
  readonly coverage: TitleMessageCoverage | null;
  readonly totalReplied: number;
  readonly totalPositive: number;
  readonly lookbackDays: number;
  readonly comparisonCount: number;
  readonly zThresholdMilli: number;
  readonly anyDistinguishable: boolean;
  readonly promptVersion: string;
  readonly createdAt: Date;
}

/**
 * The most recent analysis for a client.
 *
 * Read back rather than kept in a flash message so a paid-for answer survives a
 * refresh — buying the same analysis twice because somebody reloaded the page is
 * exactly the kind of quiet waste the ledger would show and nobody could
 * explain.
 */
export async function loadLatestTitleMessageReview(
  clientId: string,
): Promise<StoredTitleMessageReview | null> {
  const row = await prisma.aiTitleMessageReview.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      summary: true,
      findings: true,
      cautions: true,
      evidence: true,
      coverage: true,
      totalReplied: true,
      totalPositive: true,
      lookbackDays: true,
      comparisonCount: true,
      zThresholdMilli: true,
      anyDistinguishable: true,
      promptVersion: true,
      createdAt: true,
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    summary: row.summary,
    findings: Array.isArray(row.findings)
      ? (row.findings as unknown as TitleMessageFinding[])
      : [],
    cautions: Array.isArray(row.cautions)
      ? (row.cautions as unknown as string[])
      : [],
    evidence: Array.isArray(row.evidence)
      ? (row.evidence as unknown as TitleFamilyStat[])
      : [],
    coverage:
      typeof row.coverage === "object" && row.coverage !== null && !Array.isArray(row.coverage)
        ? (row.coverage as unknown as TitleMessageCoverage)
        : null,
    totalReplied: row.totalReplied,
    totalPositive: row.totalPositive,
    lookbackDays: row.lookbackDays,
    comparisonCount: row.comparisonCount,
    zThresholdMilli: row.zThresholdMilli,
    anyDistinguishable: row.anyDistinguishable,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt,
  };
}
