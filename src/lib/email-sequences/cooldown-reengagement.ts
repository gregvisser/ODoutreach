/** A staff decision for one recipient/step and the exact send history they reviewed. */
export type CooldownReengagement = {
  version: 1;
  clientId: string;
  sequenceId: string;
  stepId: string;
  contactId: string;
  email: string;
  recentOutboundId: string;
  recentSentAt: string;
  approvedByStaffUserId: string;
  approvedAt: string;
};

export function hasCurrentCooldownReengagement(input: {
  approval: unknown;
  clientId: string;
  sequenceId: unknown;
  stepId: unknown;
  contactId: string | null;
  email: string;
  recentOutboundId?: string;
  recentSentAt: Date;
  now: Date;
}): boolean {
  if (!input.approval || typeof input.approval !== "object" || Array.isArray(input.approval)) return false;
  const approval = input.approval as Partial<CooldownReengagement>;
  const approvedAt = typeof approval.approvedAt === "string" ? Date.parse(approval.approvedAt) : NaN;
  return approval.version === 1 &&
    approval.clientId === input.clientId &&
    typeof input.sequenceId === "string" && approval.sequenceId === input.sequenceId &&
    typeof input.stepId === "string" && approval.stepId === input.stepId &&
    Boolean(input.contactId) && approval.contactId === input.contactId &&
    approval.email === input.email.trim().toLowerCase() &&
    Boolean(input.recentOutboundId) && approval.recentOutboundId === input.recentOutboundId &&
    approval.recentSentAt === input.recentSentAt.toISOString() &&
    typeof approval.approvedByStaffUserId === "string" && approval.approvedByStaffUserId.length > 0 &&
    Number.isFinite(approvedAt) && approvedAt >= input.recentSentAt.getTime() && approvedAt <= input.now.getTime();
}
