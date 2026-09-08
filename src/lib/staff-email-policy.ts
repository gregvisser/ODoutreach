export function isStaffEmailAllowed(staff: { email: string }): boolean {
  const raw = process.env.STAFF_EMAIL_DOMAINS?.trim();
  if (!raw) return true;

  const domains = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = staff.email.toLowerCase();

  return domains.some((d) => {
    if (d.startsWith("@")) return email.endsWith(d);
    if (d.includes("@")) return email === d;
    return email.endsWith(`@${d}`);
  });
}
