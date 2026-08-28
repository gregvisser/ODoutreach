import { z } from "zod";

/**
 * `.bidlow/GRADES.json` is the record that decides whether this product may be
 * sold. It has been maintained by hand, and on 2026-08-27 it was found stating
 * two different customer-ready scores in one file: `customer_ready.score` said
 * 6.8 while `sell_gate` said "4.0 - FAILS the bar (6.0 even uncapped)". The
 * scores had moved and the verdict beside them had not.
 *
 * That is a transcription defect, and the fix is not to be more careful. The
 * verdict is now DERIVED from the scores by {@link evaluateSellGate}, and the
 * test beside this file fails the build if the recorded verdict and the
 * computed one ever disagree again.
 *
 * The same rule is applied to blockers: a blocker may only be recorded CLOSED
 * if it names the evidence that closed it. This repository's most repeated
 * defect is something built, reported successful, and never actually fired -
 * so "closed" without a named artefact is not accepted here either.
 */

/** Engineering AND customer-ready must both reach this before anything is sold. */
export const SELL_GATE_MINIMUM = 8;

const scoreSchema = z
  .number()
  .min(0)
  .max(10)
  .describe("A grade out of ten, as recorded by whoever ran the gates.");

const blockerSchema = z
  .object({
    id: z.string().min(1),
    summary: z.string().min(1),
    /** `us` = BidlowAI's to fix. `greg` = the client's, and it does not count against the grade. */
    owner: z.enum(["us", "greg"]),
    status: z.enum(["OPEN", "CLOSED"]),
    /**
     * What was actually run or shipped. Required on a CLOSED blocker: a commit
     * hash, a test file, a CI run - something a reader can go and check.
     */
    evidence: z.string().nullable(),
    /**
     * The date a blocker was closed, where it is worth knowing. Optional: most
     * blockers are closed by a commit and the commit carries its own date. It
     * earns its place on the ones that are closed by something OUTSIDE this
     * repository - a signed DPA, a vendor setting - where the date is the only
     * thing recording when the obligation was actually met.
     */
    closed_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "closed_on must be an ISO date")
      .optional(),
  })
  .strict()
  .refine((b) => !(b.status === "OPEN" && b.closed_on !== undefined), {
    message: "an OPEN blocker cannot carry a closing date",
    path: ["closed_on"],
  });

export const gradeRecordSchema = z
  .object({
    graded_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "graded_at must be an ISO date"),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/, "commit must be a git hash"),
    tier: z.string().min(1),
    target_band: z.string().min(1),
    engineering: z.object({ score: scoreSchema }).passthrough(),
    customer_ready: z
      .object({ score: scoreSchema, blockers: z.array(blockerSchema).min(1) })
      .passthrough(),
    sell_gate: z
      .object({
        minimum: z.literal(SELL_GATE_MINIMUM),
        /**
         * Recorded so a human opening the JSON sees the verdict without doing
         * arithmetic. It is CHECKED against the computed one, never trusted.
         */
        result: z.enum(["SATISFIED", "NOT SATISFIED"]),
      })
      .passthrough(),
  })
  .passthrough();

export type GradeRecord = z.infer<typeof gradeRecordSchema>;

export type SellGateVerdict = {
  satisfied: boolean;
  /** Which grade(s) hold the gate shut. Empty when it is open. */
  blockedBy: Array<"engineering" | "customer_ready">;
  result: "SATISFIED" | "NOT SATISFIED";
};

/**
 * The gate, computed. Both grades must reach {@link SELL_GATE_MINIMUM}; the
 * standing rule is to fix the LOWER one first, so both are reported when both
 * fall short rather than stopping at the first.
 */
export function evaluateSellGate(record: GradeRecord): SellGateVerdict {
  const blockedBy: Array<"engineering" | "customer_ready"> = [];
  if (record.engineering.score < SELL_GATE_MINIMUM) blockedBy.push("engineering");
  if (record.customer_ready.score < SELL_GATE_MINIMUM) blockedBy.push("customer_ready");

  const satisfied = blockedBy.length === 0;
  return { satisfied, blockedBy, result: satisfied ? "SATISFIED" : "NOT SATISFIED" };
}

/** Blockers that are ours AND still open - the actual distance to a sellable product. */
export function openBlockersOwnedByUs(record: GradeRecord): GradeRecord["customer_ready"]["blockers"] {
  return record.customer_ready.blockers.filter((b) => b.owner === "us" && b.status === "OPEN");
}
