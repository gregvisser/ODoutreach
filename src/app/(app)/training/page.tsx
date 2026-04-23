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
import {
  OPENSDOORS_TRAINING_EXAMPLE,
  TRAINING_FINAL_OUTCOMES,
  TRAINING_MODULES,
} from "@/lib/training/modules";
import { requireStaffUser } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

export default async function TrainingIndexPage() {
  await requireStaffUser();
  const ex = OPENSDOORS_TRAINING_EXAMPLE;
  const firstModule = TRAINING_MODULES[0];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {/* Hero */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Operator training</Badge>
          <Badge variant="secondary">Read-only</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          OpensDoors Outreach — operator training
        </h1>
        <p className="max-w-3xl text-lg text-muted-foreground">
          A screenshot-led walkthrough of every portal page, in the order you
          encounter them on a real programme. The worked example is{" "}
          <span className="font-medium text-foreground">OpensDoors itself</span>{" "}
          — the same business, mailboxes, suppression sheets and template you&apos;ll
          use in production.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {firstModule ? (
            <Link
              href={`/training/${firstModule.id}`}
              className={buttonVariants({ size: "lg" })}
            >
              Start here — Module 1: {firstModule.title} →
            </Link>
          ) : null}
          <Link
            href="/clients"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Open Clients in the portal
          </Link>
        </div>
      </header>

      {/* How this training is organised */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">How this training is organised</CardTitle>
          <CardDescription>
            Nine modules, in the order an operator encounters them. Each module
            follows the same shape: what the page is for, screenshots,
            step-by-step, what good looks like, common mistakes, what to do next,
            and a direct link into the portal. Training is read-only — nothing on
            these pages sends email, runs imports, triggers suppression sync, or
            changes settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="font-medium text-foreground">Worked client: </span>
            <span className="text-muted-foreground">{ex.client.name}</span>
          </div>
          <div>
            <span className="font-medium text-foreground">Main contact: </span>
            <span className="text-muted-foreground">
              {ex.contact.firstName} {ex.contact.lastName} ({ex.contact.role})
            </span>
          </div>
          <div>
            <span className="font-medium text-foreground">Account manager: </span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {ex.client.accountManagerEmail}
            </code>
          </div>
          <div>
            <span className="font-medium text-foreground">Mailboxes: </span>
            <span className="text-muted-foreground">
              {String(ex.mailboxes.length)} of {String(ex.capacity.maxMailboxes)}{" "}
              connected · {String(ex.capacity.perMailboxDailyCap)}/day each (
              {String(ex.capacity.dailyTheoreticalMax)}/day pool)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Module grid */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Modules</h2>
            <p className="text-sm text-muted-foreground">
              Work through them in order the first time. Jump back to any module
              as a reference later.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {String(TRAINING_MODULES.length)} modules · all read-only
          </span>
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {TRAINING_MODULES.map((m, i) => {
            const isFirst = i === 0;
            return (
              <li key={m.id}>
                <Link
                  href={`/training/${m.id}`}
                  className="group block h-full rounded-lg border border-border/80 bg-card/50 p-4 shadow-sm transition-colors hover:border-primary/60 hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="shrink-0">
                      Module {String(m.order)}
                    </Badge>
                    {isFirst ? (
                      <Badge className="shrink-0 bg-primary/10 text-primary hover:bg-primary/10">
                        Start here
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {m.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{m.tagline}</p>
                  <p className="mt-3 text-xs font-medium text-primary underline-offset-4 group-hover:underline">
                    Open module →
                  </p>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Final outcomes */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">What you should be able to do by the end</CardTitle>
          <CardDescription>
            Completing every module leaves a new OpensDoors operator able to run
            the system without being shadowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
            {TRAINING_FINAL_OUTCOMES.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Safety footer */}
      <p className="rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Safety — the training pages are strictly read-only. Nothing on{" "}
        <span className="font-mono">/training</span> sends email, runs imports,
        reconnects mailboxes, syncs suppression, or changes settings. All of
        those actions live on their own portal pages and require an explicit
        click there.
      </p>
    </div>
  );
}
