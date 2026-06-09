import { PageSkeleton } from "@/components/ui/page-skeleton";

/**
 * App-wide navigation skeleton. Shown instantly when navigating to any
 * (app) route while its dynamic server page renders, so a click never
 * looks frozen.
 */
export default function Loading() {
  return <PageSkeleton />;
}
