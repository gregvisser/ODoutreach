import "server-only";

import type { PilotContactSummary } from "@/lib/pilot-contact-types";
import { prisma } from "@/lib/db";

export async function getPilotContactSummaryForClient(
  clientId: string,
): Promise<PilotContactSummary> {
  const contacts = await prisma.contact.findMany({
    where: { clientId },
    select: { email: true, isSuppressed: true },
  });
  const totalContacts = contacts.length;
  const suppressedCount = contacts.filter((c) => c.isSuppressed).length;
  const eligible = contacts.filter((c) => !c.isSuppressed);
  const eligibleCount = eligible.length;
  const eligibleEmailsSample = eligible.slice(0, 10).map((c) => c.email);
  return {
    totalContacts,
    suppressedCount,
    eligibleCount,
    eligibleEmailsSample,
  };
}
