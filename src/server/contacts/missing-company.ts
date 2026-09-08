import "server-only";
import { prisma } from "@/lib/db";
import { isStaffEmailAllowed } from "@/lib/staff-email-policy";
import { canonicalCompanyName, MAX_COMPANY_NAME_LENGTH } from "@/lib/suppression/company-name";

/** Fill a missing employer only. Existing employers require a separate reviewed correction. */
export async function setMissingContactCompany(input: { clientId: string; contactId: string; staffUserId: string; company: string }) {
  const company = input.company.trim();
  if (!company || company.length > MAX_COMPANY_NAME_LENGTH || !canonicalCompanyName(company)) return { ok: false as const, error: "Enter the employer's company name, up to 300 characters." };
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${input.staffUserId} FOR SHARE`;
      const staff = await tx.staffUser.findUnique({ where: { id: input.staffUserId } });
      if (!staff?.isActive || !isStaffEmailAllowed(staff)) return { ok: false as const, error: "Your staff access has changed. Sign in again." };
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${input.clientId} FOR SHARE`;
      if (!await tx.client.findFirst({ where: { id: input.clientId, deletedAt: null } })) return { ok: false as const, error: "This client is unavailable." };
      await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${input.contactId} AND "clientId" = ${input.clientId} FOR UPDATE`;
      const contact = await tx.contact.findFirst({ where: { id: input.contactId, clientId: input.clientId } });
      if (!contact) return { ok: false as const, error: "This contact is unavailable for this client." };
      if (contact.company?.trim()) return { ok: false as const, error: "An employer has already been added. Refresh to review it; nothing was overwritten." };
      await tx.contact.update({ where: { id: contact.id }, data: { company } });
      await tx.auditLog.create({ data: { clientId: input.clientId, staffUserId: staff.id, action: "UPDATE", entityType: "Contact", entityId: contact.id,
        metadata: { kind: "missing_contact_company_set", previousCompany: contact.company, company },
      } });
      return { ok: true as const };
    });
  } catch {
    return { ok: false as const, uncertain: true as const, error: "We could not confirm the employer save. Refresh this page before trying again." };
  }
}
