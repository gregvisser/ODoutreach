import "server-only";

import { prisma } from "@/lib/db";

export async function loadClientTeamAccessView(clientId: string) {
  const [memberships, staffEligibleToAdd] = await Promise.all([
    prisma.clientMembership.findMany({
      where: { clientId },
      include: {
        staffUser: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.staffUser.findMany({
      where: {
        isActive: true,
        memberships: { none: { clientId } },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
      orderBy: { email: "asc" },
    }),
  ]);

  return { memberships, staffEligibleToAdd };
}
