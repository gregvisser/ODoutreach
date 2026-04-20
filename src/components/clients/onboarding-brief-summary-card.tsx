import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OnboardingBriefCompletion } from "@/lib/opensdoors-brief";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  completion: OnboardingBriefCompletion;
};

function statusBadgeVariant(
  status: OnboardingBriefCompletion["status"],
): "default" | "secondary" | "outline" {
  if (status === "ready") return "default";
  if (status === "partial") return "secondary";
  return "outline";
}

export function OnboardingBriefSummaryCard({ clientId, completion }: Props) {
  const topMissing = completion.missingLabels.slice(0, 3);
  const href = `/clients/${clientId}/onboarding`;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Onboarding brief</CardTitle>
            <CardDescription>
              Operating context for sourcing and sending — stored in{" "}
              <code className="text-xs">ClientOnboarding.formData</code>.
            </CardDescription>
          </div>
          <Badge variant={statusBadgeVariant(completion.status)} className="shrink-0">
            {completion.status === "ready"
              ? "Ready"
              : completion.status === "partial"
                ? "In progress"
                : "Not started"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Completion</span>
            <span className="tabular-nums font-medium">
              {completion.completedCount}/{completion.totalCount} · {completion.percent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                completion.percent >= 100 ? "bg-primary" : "bg-primary/80",
              )}
              style={{ width: `${completion.percent}%` }}
            />
          </div>
        </div>

        {topMissing.length > 0 ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Top gaps</p>
            <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
              {topMissing.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            {completion.missingLabels.length > 3 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                +{completion.missingLabels.length - 3} more on the onboarding page
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Required brief fields are filled. You can still refine templates and notes anytime.
          </p>
        )}

        <Link href={href} className={buttonVariants()}>
          Open onboarding
        </Link>
      </CardContent>
    </Card>
  );
}
