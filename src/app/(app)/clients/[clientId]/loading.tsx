import { PageSkeleton } from "@/components/ui/page-skeleton";

/**
 * Client-workspace skeleton. Shown while switching between a client's
 * tabs (Overview / Outreach / Lists / Activity / Contacts) so the
 * content area shows progress instead of freezing on the prior screen.
 */
export default function Loading() {
  return <PageSkeleton tiles={4} />;
}
