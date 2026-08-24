"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientEmailSequenceMutationAllowed } from "@/server/email-sequences/mutator-access";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";
import {
  confirmFamilyProposal,
  rejectFamilyProposal,
  type DecisionResult,
} from "@/server/suppression/family-proposals";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Answering a machine-proposed family link.
 *
 * The same authorisation chain as every other do-not-contact mutation:
 * signed-in staff, access to THIS workspace, and permission to change the list.
 * The underlying helpers scope every query by `clientId` as well as by row id,
 * so a wrong id from one workspace cannot reach another's row.
 *
 * Confirming is the only path from a machine guess to something the send gate
 * reads, so it refreshes contact suppression flags immediately — the operator
 * should see the effect they were told about before they clicked.
 */

const schema = z.object({
  clientId: z.string().min(1),
  proposalId: z.string().min(1),
});

async function authorise(
  input: unknown,
): Promise<
  { ok: true; clientId: string; proposalId: string; staffUserId: string } | { ok: false; error: string }
> {
  const staff = await requireOpensDoorsStaff();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid form." };

  try {
    await requireClientAccess(staff, parsed.data.clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }
  if (!(await getClientEmailSequenceMutationAllowed(staff, parsed.data.clientId))) {
    return { ok: false, error: "You do not have permission to change this list." };
  }
  return {
    ok: true,
    clientId: parsed.data.clientId,
    proposalId: parsed.data.proposalId,
    staffUserId: staff.id,
  };
}

async function record(input: {
  staffUserId: string;
  proposalId: string;
  action: "confirm" | "reject";
  proposedDomain: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      staffUserId: input.staffUserId,
      action: input.action === "confirm" ? "UPDATE" : "DELETE",
      entityType: "SuppressedDomainFamilyProposal",
      entityId: input.proposalId,
      metadata: {
        kind: `family_proposal_${input.action}`,
        proposedDomain: input.proposedDomain,
      },
    },
  });
}

export async function confirmFamilyProposalAction(
  input: z.infer<typeof schema>,
): Promise<DecisionResult> {
  const auth = await authorise(input);
  if (!auth.ok) return auth;

  const result = await confirmFamilyProposal({
    clientId: auth.clientId,
    proposalId: auth.proposalId,
    staffUserId: auth.staffUserId,
  });
  if (!result.ok) return result;

  // The block takes effect on the next send attempt; flags are refreshed now so
  // the lists reflect what the operator was told would happen.
  await refreshContactSuppressionFlagsForClient(auth.clientId);
  await record({ ...auth, action: "confirm", proposedDomain: result.proposedDomain });

  revalidatePath(`/clients/${auth.clientId}/suppression`);
  revalidatePath(`/clients/${auth.clientId}`);
  return result;
}

export async function rejectFamilyProposalAction(
  input: z.infer<typeof schema>,
): Promise<DecisionResult> {
  const auth = await authorise(input);
  if (!auth.ok) return auth;

  const result = await rejectFamilyProposal({
    clientId: auth.clientId,
    proposalId: auth.proposalId,
    staffUserId: auth.staffUserId,
  });
  if (!result.ok) return result;

  await record({ ...auth, action: "reject", proposedDomain: result.proposedDomain });
  revalidatePath(`/clients/${auth.clientId}/suppression`);
  return result;
}
