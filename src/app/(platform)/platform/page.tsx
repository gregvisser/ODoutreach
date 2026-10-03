import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAiSpend, formatRocketReachCredits } from "@/lib/tenant/platform-dashboard";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { assertPlatformDashboardAccess } from "@/server/tenant/platform-admin";
import { loadPlatformOrganisationOverviews } from "@/server/tenant/platform-overview";

import { CreateOrganisationForm, EnterOrganisationForm } from "./platform-forms";

export const dynamic = "force-dynamic";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const staff = await requireOpensDoorsStaff();
  assertPlatformDashboardAccess(staff);
  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = rawError?.trim() ? rawError.trim().slice(0, 200) : null;
  const organisations = await loadPlatformOrganisationOverviews();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Platform</h1>
        <p className="mt-1 text-muted-foreground">
          Every organisation on this platform. OpensDoors is one of them. Enter a workspace to work inside that organisation, then come back here. Each organisation only sees its own clients, people, and sending.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sends today use the UTC day, the same window as mailbox caps.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">New organisation</CardTitle>
          <CardDescription>
            Creates an active organisation with every capability switched on, matching OpensDoors today. You invite the first owner from its page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganisationForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Organisations</h2>
        {organisations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No organisations yet.</p>
        ) : (
          <ul className="grid gap-3">
            {organisations.map((organisation) => (
              <li key={organisation.id}>
                <Card className="border-border/80 shadow-sm">
                  <CardContent className="space-y-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">{organisation.name}</p>
                        <p className="break-all text-sm text-muted-foreground">{organisation.slug}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <EnterOrganisationForm organisationId={organisation.id} size="sm" />
                        <Link
                          prefetch={false}
                          href={`/platform/${organisation.id}`}
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric
                        label="Status"
                        value={organisation.status === "ACTIVE" ? "Active" : "Suspended"}
                      />
                      <Metric
                        label="Members"
                        value={String(organisation.memberCount)}
                      />
                      <Metric label="Mailboxes" value={String(organisation.mailboxCount)} />
                      <Metric label="Sends today" value={String(organisation.sendsToday)} />
                      <Metric
                        label="RocketReach"
                        value={formatRocketReachCredits(
                          organisation.rocketReachCreditsUsed,
                          organisation.rocketReachCreditAllowance,
                        )}
                      />
                      <Metric
                        label="AI spend this month"
                        value={formatAiSpend(
                          organisation.aiSpendMicroUsd,
                          organisation.aiSpendCapMicroUsd,
                        )}
                      />
                      <Metric label="Health" value={organisation.healthLabel} />
                    </dl>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
