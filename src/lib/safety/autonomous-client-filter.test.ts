import { describe, expect, it } from "vitest";

import { autonomousClientWhereFilter } from "./autonomous-client-filter";

/**
 * WHY THIS EXISTS — a hole found by reading the code rather than assuming it.
 *
 * The dispatch gate treats a row carrying a `staffUserId` as human-launched and
 * lets it through, so staff are never blocked. But `advance-due-followups.ts`
 * runs on a cron with a SYSTEM ACTOR: it picks the first ADMIN staff user and
 * attributes automated follow-ups to them (lines 99-106). Those rows therefore
 * carry a staffUserId and LOOK human — while no person initiated them.
 *
 * So an agent that poked the follow-up advancer would have produced real sends
 * for every active client, and the dispatch gate would have waved them through.
 *
 * The fix is to stop those rows being BORN for clients that are not
 * allowlisted, rather than trying to catch them later. This is the filter that
 * does it.
 */

describe("when no relay is running", () => {
  it("adds no filter at all, so ordinary follow-ups are untouched", () => {
    expect(autonomousClientWhereFilter({ active: false, allowlist: [] })).toEqual({});
    expect(autonomousClientWhereFilter({ active: false, allowlist: ["bidlowai"] })).toEqual({});
  });
});

describe("while a relay IS running", () => {
  it("narrows to the allowlisted clients", () => {
    expect(autonomousClientWhereFilter({ active: true, allowlist: ["bidlowai"] })).toEqual({
      slug: { in: ["bidlowai"] },
    });
  });

  it("matches NOTHING when the allowlist is empty", () => {
    // `in: []` matches no rows, so no automated follow-up is generated for
    // anyone. That is the fail-closed behaviour expressed as a query.
    expect(autonomousClientWhereFilter({ active: true, allowlist: [] })).toEqual({
      slug: { in: [] },
    });
  });

  it("normalises slugs the same way the send gate does", () => {
    // Divergence between the two would be its own defect: a client allowed to
    // be sent for but not to generate follow-ups, or the reverse.
    expect(
      autonomousClientWhereFilter({ active: true, allowlist: [" BidlowAI ", "", "  ", "x"] }),
    ).toEqual({ slug: { in: ["bidlowai", "x"] } });
  });
});
