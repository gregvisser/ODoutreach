import "server-only";

import { AI_MODELS } from "@/lib/ai/model-catalog";
import {
  buildRepPerformanceInput,
  parseRepPerformanceToolUse,
  REP_PERFORMANCE_PROMPT_VERSION,
  REP_PERFORMANCE_SYSTEM_PROMPT,
  REP_PERFORMANCE_TOOL,
  type RepFinding,
} from "@/lib/ai/rep-performance";
import {
  assessRepEvidence,
  REP_LOOKBACK_DAYS,
  type RepIdentity,
  type RepSendOutcome,
  type RepStat,
} from "@/lib/ai/rep-performance-evidence";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

import { callAnthropicMessages } from "./anthropic-messages";
import { runMeteredAiCall } from "./metered-call";

/**
 * Compare one client's sending mailboxes, and record what it cost.
 *
 * WHAT THIS FUNCTION CHANGES: nothing. It reads sent mail and linked replies and
 * writes one `AiRepPerformanceReview` row. It does not touch a mailbox, a cap, a
 * sending toggle, a sequence, a queue row or a person's record — and it has no
 * route to any of them. That is asserted by test.
 *
 * THE ORDER OF OPERATIONS IS THE SAFETY PROPERTY, and here it protects a person
 * rather than a budget. The table is built and the significance test is run
 * BEFORE the model is called, so a client whose senders cannot be told apart
 * costs nothing at all and produces no prose about anybody. A paragraph
 * explaining why one named colleague is behind, generated from a gap that is
 * statistically indistinguishable from a coin toss, is not a cheap answer — it
 * is a confidently wrong one that ends up in a performance conversation.
 *
 * It also does not retry. A timed-out call may already have been served and
 * billed, so an automatic retry would charge the client twice.
 */

/** A paragraph, a few findings and some cautions. Caps the output side. */
const MAX_OUTPUT_TOKENS = 2_000;

export type ExplainRepPerformanceResult =
  | {
      readonly ok: true;
      readonly reviewId: string;
      readonly summary: string;
      readonly findings: readonly RepFinding[];
      readonly cautions: readonly string[];
      readonly anyDistinguishable: boolean;
      readonly costMicroUsd: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * How a mailbox is named on the table and in the prose.
 *
 * The person's name first where there is one, because the row has to be
 * findable by whoever is reading it, and the address after it because two
 * colleagues can share a display name. Falls back to the address alone.
 */
function mailboxLabel(row: {
  senderDisplayName: string | null;
  displayName: string | null;
  email: string;
}): string {
  const name = row.senderDisplayName?.trim() ?? row.displayName?.trim() ?? "";
  return name ? `${name} — ${row.email}` : row.email;
}

/**
 * Read this client's sent mail, by mailbox, and what became of each send.
 *
 * A reply is counted as `linkedOutboundEmailId` pointing at the row — the same
 * linkage the inbox and the reports already use. Unlinked replies exist (Gmail
 * rewrites Message-IDs, so the matcher cannot always be certain) and are
 * deliberately NOT counted: an unlinked reply has no mailbox to attribute, and
 * spreading it across senders would invent the difference we are asking about.
 *
 * That under-counts every sender, and it under-counts them by however much the
 * matcher missed for each — which is itself uneven. The panel says so, and it is
 * one of the reasons the significance threshold is set where it is rather than
 * lower.
 */
async function loadRepOutcomes(args: {
  clientId: string;
  since: Date;
}): Promise<RepSendOutcome[]> {
  const rows = await prisma.outboundEmail.findMany({
    where: {
      clientId: args.clientId,
      sentAt: { not: null, gte: args.since },
      mailboxIdentityId: { not: null },
    },
    select: {
      mailboxIdentityId: true,
      bouncedAt: true,
      inboundReplies: { select: { classification: true } },
    },
  });

  return rows.flatMap((row) =>
    row.mailboxIdentityId === null
      ? []
      : [
          {
            mailboxIdentityId: row.mailboxIdentityId,
            replied: row.inboundReplies.length > 0,
            positive: row.inboundReplies.some((r) => r.classification === "POSITIVE"),
            bounced: row.bouncedAt !== null,
          },
        ],
  );
}

async function loadRepIdentities(clientId: string): Promise<RepIdentity[]> {
  const rows = await prisma.clientMailboxIdentity.findMany({
    where: { clientId },
    select: {
      id: true,
      email: true,
      displayName: true,
      senderDisplayName: true,
    },
  });

  return rows.map((row) => ({
    mailboxIdentityId: row.id,
    label: mailboxLabel(row),
  }));
}

export async function explainRepPerformance(args: {
  clientId: string;
  staffUserId: string;
  /** Injectable so the evidence window is testable at a fixed point. */
  now?: Date;
}): Promise<ExplainRepPerformanceResult> {
  const client = await prisma.client.findFirst({
    where: { id: args.clientId, deletedAt: null },
    select: { id: true, slug: true, name: true, industry: true },
  });
  if (!client) return { ok: false, reason: "client_not_found" };

  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - REP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [outcomes, identities] = await Promise.all([
    loadRepOutcomes({ clientId: client.id, since }),
    loadRepIdentities(client.id),
  ]);
  const verdict = assessRepEvidence(outcomes, identities);

  // The gate. Fails closed BEFORE any money is spent and before anything is
  // written about anybody: no call, no ledger row for a call that did not
  // happen, and a reason the operator can act on.
  if (!verdict.sufficient) {
    return { ok: false, reason: verdict.reason };
  }

  const model = AI_MODELS.REP_PERFORMANCE;

  const outcome = await runMeteredAiCall({
    client: { id: client.id, slug: client.slug },
    feature: "REP_PERFORMANCE",
    model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    subject: { type: "Client", id: client.id },
    invoke: async () => {
      const response = await callAnthropicMessages({
        apiKey: process.env.ANTHROPIC_API_KEY as string,
        model,
        system: REP_PERFORMANCE_SYSTEM_PROMPT,
        userText: buildRepPerformanceInput({
          clientName: client.name,
          industry: client.industry,
          reps: verdict.reps,
          totalSent: verdict.totalSent,
          totalReplied: verdict.totalReplied,
          totalPositive: verdict.totalPositive,
          lookbackDays: REP_LOOKBACK_DAYS,
          anyDistinguishable: verdict.anyDistinguishable,
        }),
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: REP_PERFORMANCE_TOOL,
      });
      return {
        result: parseRepPerformanceToolUse(response.content),
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
      { scope: "ai.explain-rep-performance", clientSlug: client.slug },
      "Sender comparison returned an unusable answer; nothing was written",
    );
    return { ok: false, reason: "unusable_answer" };
  }

  /**
   * The last line of the guardrail, and the only one that survives a model
   * ignoring every instruction it was given.
   *
   * The prompt says not to explain a sender the table marked as within normal
   * variation, and the input says so again per row. If it does anyway, the
   * finding is dropped here: a paragraph about a named colleague, justified by
   * a difference our own arithmetic says is not a difference, is exactly the
   * output this feature exists to prevent, and a prompt is not a control.
   *
   * Matched on the label because that is what the model was given and what it
   * echoes back; a finding naming a sender we cannot find in the table is
   * dropped too, since it cannot be checked against any verdict.
   */
  const distinguishable = new Set(
    verdict.reps
      .filter(
        (rep) =>
          rep.comparison.kind !== "indistinguishable" ||
          rep.bounceComparison.kind !== "indistinguishable",
      )
      .map((rep) => rep.label),
  );
  const findings = parsed.findings.filter((finding) =>
    distinguishable.has(finding.senderLabel),
  );
  const droppedFindings = parsed.findings.length - findings.length;
  if (droppedFindings > 0) {
    logger.warn(
      {
        scope: "ai.explain-rep-performance",
        clientSlug: client.slug,
        droppedFindings,
      },
      "Dropped AI findings about senders whose results are within normal variation",
    );
  }

  const review = await prisma.aiRepPerformanceReview.create({
    data: {
      clientId: client.id,
      summary: parsed.summary,
      findings: findings as unknown as object[],
      cautions: parsed.cautions as unknown as string[],
      // Stored with the explanation so the panel can print the numbers beside
      // the prose, and so a comparison made on a thinner history stays
      // auditable once the history has grown past it.
      evidence: verdict.reps as unknown as object[],
      totalSent: verdict.totalSent,
      totalReplied: verdict.totalReplied,
      totalPositive: verdict.totalPositive,
      lookbackDays: REP_LOOKBACK_DAYS,
      anyDistinguishable: verdict.anyDistinguishable,
      model,
      promptVersion: REP_PERFORMANCE_PROMPT_VERSION,
      requestedByStaffUserId: args.staffUserId,
    },
    select: { id: true },
  });

  logger.info(
    {
      scope: "ai.explain-rep-performance",
      clientSlug: client.slug,
      senders: verdict.reps.length,
      findings: findings.length,
      anyDistinguishable: verdict.anyDistinguishable,
      costMicroUsd: outcome.costMicroUsd,
    },
    "Compared sending mailboxes",
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

export interface StoredRepPerformanceReview {
  readonly id: string;
  readonly summary: string;
  readonly findings: readonly RepFinding[];
  readonly cautions: readonly string[];
  readonly evidence: readonly RepStat[];
  readonly totalSent: number;
  readonly totalReplied: number;
  readonly totalPositive: number;
  readonly lookbackDays: number;
  readonly anyDistinguishable: boolean;
  readonly promptVersion: string;
  readonly createdAt: Date;
}

/**
 * The most recent comparison for a client.
 *
 * Read back rather than kept in a flash message so a paid-for answer survives a
 * refresh — buying the same comparison twice because somebody reloaded the page
 * is exactly the kind of quiet waste the ledger would show and nobody could
 * explain.
 */
export async function loadLatestRepPerformanceReview(
  clientId: string,
): Promise<StoredRepPerformanceReview | null> {
  const row = await prisma.aiRepPerformanceReview.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      summary: true,
      findings: true,
      cautions: true,
      evidence: true,
      totalSent: true,
      totalReplied: true,
      totalPositive: true,
      lookbackDays: true,
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
      ? (row.findings as unknown as RepFinding[])
      : [],
    cautions: Array.isArray(row.cautions)
      ? (row.cautions as unknown as string[])
      : [],
    evidence: Array.isArray(row.evidence)
      ? (row.evidence as unknown as RepStat[])
      : [],
    totalSent: row.totalSent,
    totalReplied: row.totalReplied,
    totalPositive: row.totalPositive,
    lookbackDays: row.lookbackDays,
    anyDistinguishable: row.anyDistinguishable,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt,
  };
}
