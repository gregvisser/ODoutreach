import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { INBOUND_REPLY_METADATA_KIND } from "@/lib/inbox/inbound-reply-metadata";

/** Preserve legacy SQL/JSON null and missing-kind rows; exclude only known replies. */
export const GENERIC_OUTBOUND_ONLY: Prisma.OutboundEmailWhereInput = {
  OR: [
    { metadata: { path: ["kind"], not: INBOUND_REPLY_METADATA_KIND } },
    { metadata: { path: ["kind"], equals: Prisma.AnyNull } },
  ],
};
