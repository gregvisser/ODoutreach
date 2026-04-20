import Link from "next/link";
import { notFound } from "next/navigation";

import { OpensDoorsBriefGuidedForm } from "@/components/clients/opensdoors-brief-guided-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  computeOnboardingBriefCompletion,
  parseOpensDoorsBrief,
} from "@/lib/opensdoors-brief";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
};

function readinessBadgeVariant(
  status: ReturnType<typeof computeOnboardingBriefCompletion>["status"],
): "default" | "secondary" | "outline" {
  if (status === "ready") return "default";
  if (status === "partial") return "secondary";
  return "outline";
}

export default async function ClientBriefPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;

  const brief = parseOpensDoorsBrief(client.onboarding?.formData);
  const completion = computeOnboardingBriefCompletion(client.onboarding?.formData);
  const base = `/clients/${client.id}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Operating brief
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
            <Badge variant="outline">{client.status}</Badge>
            <Badge variant={readinessBadgeVariant(completion.status)}>
              Brief · {completion.percent}%
            </Badge>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Capture the operating brief before sourcing and sending. This is the single place for
            client context — everything else in the workspace builds on it.
          </p>
        </div>
        <Link
          href={base}
          className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
        >
          Back to overview
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 rounded-xl border border-border/80 bg-card p-6 shadow-sm">
          <OpensDoorsBriefGuidedForm clientId={client.id} initial={brief} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Brief readiness</CardTitle>
              <CardDescription>
                {completion.completedCount} of {completion.totalCount} required fields complete.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="tabular-nums font-medium">{completion.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full bg-primary",
                      completion.percent >= 100 && "bg-primary",
                    )}
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
              </div>

              {completion.nextRecommendedLabel ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Next recommended
                  </p>
                  <p className="text-sm text-foreground">{completion.nextRecommendedLabel}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Brief is complete against the required checklist. Refine templates anytime.
                </p>
              )}

              {completion.missingLabels.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Missing
                  </p>
                  <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-sm text-muted-foreground">
                    {completion.missingLabels.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Next modules</CardTitle>
              <CardDescription>Continue the operating pathway for this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Link
                href={`${base}/mailboxes`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "justify-start",
                )}
              >
                Mailboxes
              </Link>
              <Link
                href={`${base}/sources`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "justify-start",
                )}
              >
                Sources
              </Link>
              <Link
                href={`${base}/suppression`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "justify-start",
                )}
              >
                Suppression
              </Link>
              <Link
                href={`${base}/outreach`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "justify-start",
                )}
              >
                Outreach
              </Link>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
