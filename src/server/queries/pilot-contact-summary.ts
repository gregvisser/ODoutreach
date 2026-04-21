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
    select: {
      email: true,
      isSuppressed: true,
      // PR F2: select the full identifier shape so the pilot summary can
      // separate "missing email, has LinkedIn/phone" (valid_no_email)
      // from "no identifier at all" (missing_identifier). Previously the
      // reducer only saw (email, isSuppressed) and collapsed both cases
      // into a single "not eligible" bucket.
      linkedIn: true,
      mobilePhone: true,
      officePhone: true,
    },
  });
  // PR F1/F2: eligibility reducer lives in `pilot-contact-types` so it can
  // be tested without Prisma. It treats null emails as valid-but-not-
  // email-sendable and now exposes per-reason counts.
  return summarizePilotContacts(contacts);
}
