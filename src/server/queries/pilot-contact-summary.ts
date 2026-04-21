import "server-only";

import {
  summarizePilotContacts,
  type PilotContactSummary,
} from "@/lib/pilot-contact-types";
import { prisma } from "@/lib/db";

export async function getPilotContactSummaryForClient(
  clientId: string,
): Promise<PilotContactSummary> {
  const contacts = await prisma.contact.findMany({
    where: { clientId },
    select: { email: true, isSuppressed: true },
  });
  // PR F1: eligibility reducer lives in `pilot-contact-types` so it can be
  // tested without Prisma. It correctly treats null emails as valid-but-
  // not-email-sendable.
  return summarizePilotContacts(contacts);
}
