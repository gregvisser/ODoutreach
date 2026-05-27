import "server-only";

/**
 * Only this account may approve a proposed fix on a support ticket.
 * Defaults to greg@bidlow.co.uk; override with SUPPORT_APPROVER_EMAIL.
 */
export function supportApproverEmail(): string {
  return (
    process.env.SUPPORT_APPROVER_EMAIL?.trim().toLowerCase() ||
    "greg@bidlow.co.uk"
  );
}

export function isSupportApprover(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === supportApproverEmail();
}
