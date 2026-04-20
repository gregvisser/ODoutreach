import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tile = {
  title: string;
  description: string;
  metric: string;
  href: string;
  actionLabel: string;
};

export function ClientOverviewSummaryGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.title} className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>{t.title}</CardDescription>
            <CardTitle className="text-xl tabular-nums leading-tight">{t.metric}</CardTitle>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href={t.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              {t.actionLabel}
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
