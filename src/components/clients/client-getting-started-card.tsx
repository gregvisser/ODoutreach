import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GettingStartedViewModel } from "@/lib/clients/getting-started-view-model";

type Props = {
  viewModel: GettingStartedViewModel;
  clientStatus: string;
};

/**
 * PR I — Onboarding checklist rendered on the client overview for any
 * workspace still in `ONBOARDING` or with incomplete setup modules.
 * Purely presentational: consumes the pure view-model from
 * `buildGettingStartedViewModel`.
 */
export function ClientGettingStartedCard({ viewModel, clientStatus }: Props) {
  if (!viewModel.shouldRender) return null;

  return (
    <Card className="border-amber-300/60 bg-amber-50/60 shadow-sm dark:border-amber-500/20 dark:bg-amber-950/20">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              Getting started
            </CardTitle>
            <CardDescription>
              {clientStatus === "ONBOARDING"
                ? "This client is in onboarding. Complete the workspace modules before launch."
                : "Workspace setup is incomplete. Complete the remaining modules before launch."}
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 border-amber-400/60">
            {String(viewModel.completedCount)} / {String(viewModel.totalCount)}{" "}
            complete
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {viewModel.items.map((item, index) => {
            const marker = item.done ? "✓" : String(index + 1);
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2"
              >
                <span
                  aria-hidden="true"
                  className={
                    item.done
                      ? "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                      : "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                  }
                >
                  {marker}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={item.href}
                      className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {item.label}
                    </Link>
                    {item.done ? (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      >
                        Done
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
