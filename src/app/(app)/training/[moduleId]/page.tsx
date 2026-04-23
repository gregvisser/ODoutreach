import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrainingScreenshot } from "@/components/training/training-screenshot";
import {
  getTrainingModule,
  TRAINING_MODULES,
  type TrainingExample,
  type TrainingNextStep,
} from "@/lib/training/modules";
import { requireStaffUser } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

type Params = { moduleId: string };
type Props = { params: Promise<Params> };

export async function generateStaticParams(): Promise<Params[]> {
  return TRAINING_MODULES.map((m) => ({ moduleId: m.id }));
}

function calloutClass(tone: "info" | "warn" | "success"): string {
  if (tone === "warn") {
    return "rounded-md border border-amber-400/60 bg-amber-50/60 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-950/20";
  }
  if (tone === "success") {
    return "rounded-md border border-emerald-400/60 bg-emerald-50/60 p-4 text-sm dark:border-emerald-500/30 dark:bg-emerald-950/20";
  }
  return "rounded-md border border-primary/30 bg-primary/5 p-4 text-sm";
}

function ExampleGrid({ examples }: { examples: readonly TrainingExample[] }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        OpensDoors example data
      </p>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {examples.map((e, i) => (
          <div key={`${e.label}-${String(i)}`} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{e.label}</dt>
            <dd
              className={
                e.mono
                  ? "truncate font-mono text-xs text-foreground"
                  : "truncate text-sm text-foreground"
              }
            >
              {e.href ? (
                <Link
                  href={e.href}
                  className="underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.value}
                </Link>
              ) : (
                e.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function NextStepLink({ step }: { step: TrainingNextStep }) {
  const href = step.moduleId ? `/training/${step.moduleId}` : step.href;
  if (!href) {
    return (
      <div className="rounded-md border border-border/60 bg-background p-3">
        <p className="font-medium text-foreground">{step.label}</p>
        {step.description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
        ) : null}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="group block rounded-md border border-border/60 bg-background p-3 transition-colors hover:border-primary/60 hover:bg-card"
    >
      <p className="font-medium text-foreground">
        {step.label}
        <span className="ml-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
          →
        </span>
      </p>
      {step.description ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
      ) : null}
    </Link>
  );
}

export default async function TrainingModulePage({ params }: Props) {
  await requireStaffUser();
  const { moduleId } = await params;
  const mod = getTrainingModule(moduleId);
  if (!mod) notFound();

  const currentIndex = TRAINING_MODULES.findIndex((m) => m.id === mod.id);
  const prev = currentIndex > 0 ? TRAINING_MODULES[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < TRAINING_MODULES.length - 1
      ? TRAINING_MODULES[currentIndex + 1]
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/training" className="underline-offset-2 hover:underline">
          Training
        </Link>
        <span className="px-1.5" aria-hidden="true">/</span>
        <span className="text-foreground">{mod.title}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Module {String(mod.order)} of {String(TRAINING_MODULES.length)}
          </Badge>
          <Badge variant="secondary">Read-only training</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{mod.title}</h1>
        <p className="text-lg text-muted-foreground">{mod.tagline}</p>
      </header>

      {/* 1. What this page is for */}
      <section aria-labelledby="purpose-heading" className="space-y-3">
        <h2 id="purpose-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          1 · What this page is for
        </h2>
        <Card className="border-border/80 shadow-sm">
          <CardContent className="space-y-3 py-4 text-sm">
            <p className="text-foreground/90">{mod.purpose}</p>
            {mod.details?.map((d, i) => (
              <p key={i} className="text-foreground/80">
                {d}
              </p>
            ))}
            {mod.callout ? (
              <div className={calloutClass(mod.callout.tone)}>
                {mod.callout.heading ? (
                  <p className="mb-1 font-medium text-foreground">{mod.callout.heading}</p>
                ) : null}
                <p className="text-foreground/90">{mod.callout.body}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* 2. Screenshots */}
      {mod.screenshots.length > 0 ? (
        <section aria-labelledby="screenshots-heading" className="space-y-3">
          <h2
            id="screenshots-heading"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            2 · What it looks like
          </h2>
          <div className="space-y-4">
            {mod.screenshots.map((s, i) => (
              <TrainingScreenshot key={s.src} screenshot={s} priority={i === 0} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Example data panel (OpensDoors specifics) */}
      {mod.exampleData && mod.exampleData.length > 0 ? (
        <section aria-label="OpensDoors example data">
          <ExampleGrid examples={mod.exampleData} />
        </section>
      ) : null}

      {/* Optional code/email block */}
      {mod.code ? (
        <section aria-label={mod.code.caption ?? "Code sample"}>
          <figure className="space-y-2">
            {mod.code.caption ? (
              <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {mod.code.caption}
              </figcaption>
            ) : null}
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
              {mod.code.content}
            </pre>
          </figure>
        </section>
      ) : null}

      {/* 3. Step-by-step instructions */}
      <section aria-labelledby="steps-heading" className="space-y-3">
        <h2
          id="steps-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          3 · Step by step
        </h2>
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-4">
            <ol className="space-y-3">
              {mod.steps.map((s, i) => (
                <li
                  key={s.title}
                  className="rounded-md border border-border/60 bg-background p-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                    >
                      {String(i + 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{s.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{s.detail}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* 4. What good looks like + 5. Common mistakes side-by-side */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card className="border-emerald-500/30 bg-emerald-50/30 shadow-sm dark:bg-emerald-950/10">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
              4 · What good looks like
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
              {mod.whatGoodLooksLike.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-amber-50/30 shadow-sm dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              5 · Common mistakes to avoid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
              {mod.commonMistakes.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* 6. What to do next */}
      <section aria-labelledby="next-heading" className="space-y-3">
        <h2
          id="next-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          6 · What to do next
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {mod.nextSteps.map((s) => (
            <NextStepLink key={s.label} step={s} />
          ))}
        </div>
      </section>

      {/* 7. Portal link — Open this page in the portal */}
      <section aria-labelledby="portal-link-heading" className="space-y-3">
        <h2
          id="portal-link-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          7 · Open this page in the portal
        </h2>
        <Card className="border-primary/30 bg-primary/5 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{mod.portalLink.label}</p>
              {mod.portalLink.description ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {mod.portalLink.description}
                </p>
              ) : null}
            </div>
            <Link
              href={mod.portalLink.href}
              className={buttonVariants({ size: "sm" })}
            >
              Open →
            </Link>
          </CardContent>
        </Card>
        {mod.relatedPortalLinks && mod.relatedPortalLinks.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {mod.relatedPortalLinks.map((p) => (
              <li key={p.href + p.label}>
                <Link
                  href={p.href}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {p.label}
                </Link>
                {p.description ? (
                  <span className="text-muted-foreground"> — {p.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Outcomes */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Outcomes</CardTitle>
          <CardDescription>
            After this module an operator should be able to do all of the following without further help.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
            {mod.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Prev / Next navigation */}
      <nav
        aria-label="Module navigation"
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6"
      >
        <div className="min-w-0">
          {prev ? (
            <Link
              href={`/training/${prev.id}`}
              className="group block max-w-sm text-sm"
            >
              <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                ← Previous module
              </span>
              <span className="block font-medium text-primary group-hover:underline">
                {String(prev.order)}. {prev.title}
              </span>
            </Link>
          ) : (
            <Link
              href="/training"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              ← Back to training overview
            </Link>
          )}
        </div>
        <div className="min-w-0 text-right">
          {next ? (
            <Link
              href={`/training/${next.id}`}
              className="group block max-w-sm text-sm"
            >
              <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                Next module →
              </span>
              <span className="block font-medium text-primary group-hover:underline">
                {String(next.order)}. {next.title}
              </span>
            </Link>
          ) : (
            <Link
              href="/training"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to training overview →
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
