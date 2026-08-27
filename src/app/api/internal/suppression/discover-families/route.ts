import { NextRequest, NextResponse } from "next/server";

import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";
import { prisma } from "@/lib/db";
import {
  persistProposalPlans,
  planClientFamilyProposals,
} from "@/server/suppression/family-discovery-run";

export const runtime = "nodejs";

/**
 * Scheduled related-domain discovery (Bearer PROCESS_QUEUE_SECRET).
 *
 * Why this exists at all: the detection was built, migrated and tested, and its
 * only caller was an ops script somebody had to remember to run. A feature that
 * depends on a human remembering is a feature that does not fire. The button on
 * the do-not-contact page answers "check the list I just uploaded"; this answers
 * "keep checking without being asked".
 *
 * WHAT THIS CAN DO: write `PENDING` proposals — questions for an operator.
 * WHAT THIS CANNOT DO: block a send, unblock a send, or send anything. It never
 * writes `SuppressedDomainFamily`; only a human clicking confirm does that, and
 * the count assertion below proves the run kept that promise.
 *
 * DNS is resolved from the CONTACT side at concurrency 16, so a full pass is
 * about a minute. It runs nightly rather than hourly because published DMARC and
 * SPF records change on the order of months.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Family discovery not configured" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // The invariant this design rests on, measured rather than asserted.
    const familyRowsBefore = await prisma.suppressedDomainFamily.count();

    const clients = await prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const errors: string[] = [];
    let processed = 0;
    let created = 0;
    let refreshed = 0;
    let autoBlocked = 0;
    let contactDomainsChecked = 0;
    let tenantLookups = 0;
    let tenantBudgetExhausted = false;

    for (const client of clients) {
      try {
        const plan = await planClientFamilyProposals({ clientId: client.id });
        if (
          plan.contactDomainsChecked === 0 ||
          plan.suppressedDomainCount === 0
        ) {
          continue;
        }
        processed += 1;
        contactDomainsChecked += plan.contactDomainsChecked;
        tenantLookups += plan.tenant.lookupsSpent;
        if (plan.tenant.budgetExhausted) tenantBudgetExhausted = true;

        const written = await persistProposalPlans({
          clientId: client.id,
          plans: plan.plans,
        });
        created += written.created;
        refreshed += written.refreshed;
        autoBlocked += written.autoBlocked;
      } catch (e) {
        // One client's broken DNS must not silently shrink the run. Naming the
        // client is the difference between an alert and a scavenger hunt.
        const msg = e instanceof Error ? e.message : "unknown error";
        errors.push(`${client.name}: ${msg}`);
      }
    }

    // Discovery may now block, but only in one way and only within a budget it
    // reported. The check is therefore tightened rather than removed: growth
    // must be exactly attributable to auto-blocks this run performed.
    //
    // Two rows per auto-block is the ceiling — the newly blocked domain, plus
    // the seed that anchors its family if that seed was not already listed.
    // With the flag off `autoBlocked` is 0 and this is the original invariant,
    // unchanged: the table must not move at all.
    const familyRowsAfter = await prisma.suppressedDomainFamily.count();
    const growth = familyRowsAfter - familyRowsBefore;
    if (growth < 0 || growth > autoBlocked * 2) {
      errors.push(
        `discovery changed the confirmed-family table by ${growth} row(s) after ${autoBlocked} automatic block(s) (${familyRowsBefore} -> ${familyRowsAfter}); it may only ever propose, or block within its own accounting`,
      );
    }

    if (tenantBudgetExhausted) {
      // A cap that silently truncates coverage is how a job goes green while
      // checking a fraction of the list. Say it out loud.
      errors.push(
        `the Microsoft tenant sweep hit its lookup budget, so some domains were NOT checked (${tenantLookups} lookups spent)`,
      );
    }

    const result = {
      processed,
      contactDomainsChecked,
      created,
      refreshed,
      autoBlocked,
      tenantLookups,
      errors,
    };
    return NextResponse.json(jobResponseBody(result), {
      status: jobOutcome(result).status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Family discovery failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
