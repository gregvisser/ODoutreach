import { redirect } from "next/navigation";

/**
 * Legacy `/dashboard` route. Reports (`/reporting`) is the operational
 * dashboard for staff (see `docs/ops/SYSTEM_HANDOVER_READINESS_AUDIT.md`,
 * section A.1). This route exists only to preserve old bookmarks and
 * server-action `revalidatePath` history; it does no rendering work.
 */
export default function LegacyDashboardRedirect(): never {
  redirect("/reporting");
}
