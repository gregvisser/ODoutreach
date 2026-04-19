import "server-only";

import { CONTROLLED_PILOT_METADATA_KIND } from "@/lib/controlled-pilot-constants";
import { shortenIdempotencyKey } from "@/lib/governed-send-display";
import { prisma } from "@/lib/db";

export type GovernedSendLedgerRow = {
  outboundId: string;
  toEmail: string;
  subject: string | null;
  outboundStatus: string;
  mailboxEmail: string | null;
  mailboxIdentityId: string | null;
  reservationStatus: string | null;
  windowKey: string | null;
  idempotencyKeyShort: string | null;
  createdAtIso: string;
  sentAtIso: string | null;
};

const GOVERNED_TEST_KIND = "governedTestSend" as const;
/**
 * Recent governed / pilot sends for a client (metadata.kind = governed test or controlled pilot), newest first.
 * Read-only; joins mailbox and reservation when present.
 */
export async function getRecentGovernedSendsForClient(
  clientId: string,
  limit = 25,
): Promise<GovernedSendLedgerRow[]> {
  const rows = await prisma.outboundEmail.findMany({
    where: {
      clientId,
      OR: [
        { metadata: { path: ["kind"], equals: GOVERNED_TEST_KIND } },
        { metadata: { path: ["kind"], equals: CONTROLLED_PILOT_METADATA_KIND } },
      ],
    },
    include: {
      sendReservation: true,
      mailbox: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((o) => {
    const r = o.sendReservation;
    const idem = r?.idempotencyKey ?? null;
    return {
      outboundId: o.id,
      toEmail: o.toEmail,
      subject: o.subject,
      outboundStatus: o.status,
      mailboxEmail: o.mailbox?.email ?? null,
      mailboxIdentityId: o.mailboxIdentityId,
      reservationStatus: r?.status ?? null,
      windowKey: r?.windowKey ?? null,
      idempotencyKeyShort: shortenIdempotencyKey(idem),
      createdAtIso: o.createdAt.toISOString(),
      sentAtIso: o.sentAt?.toISOString() ?? null,
    };
  });
}
