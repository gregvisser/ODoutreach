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
    let contactDomainsChecked = 0;

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

        const written = await persistProposalPlans({
          clientId: client.id,
          plans: plan.plans,
        });
        created += written.created;
        refreshed += written.refreshed;
      } catch (e) {
        // One client's broken DNS must not silently shrink the run. Naming the
        // client is the difference between an alert and a scavenger hunt.
        const msg = e instanceof Error ? e.message : "unknown error";
        errors.push(`${client.name}: ${msg}`);
      }
    }

    const familyRowsAfter = await prisma.suppressedDomainFamily.count();
    if (familyRowsAfter !== familyRowsBefore) {
      // Discovery proposes; it never blocks. If that ever stops being true the
      // run must fail loudly rather than quietly suppress a real company.
      errors.push(
        `discovery changed the confirmed-family table (${familyRowsBefore} -> ${familyRowsAfter}); it must only ever propose`,
      );
    }

    const result = {
      processed,
      contactDomainsChecked,
      created,
      refreshed,
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
