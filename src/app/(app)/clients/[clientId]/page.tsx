import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientMailboxIdentitiesPanel } from "@/components/clients/client-mailbox-identities-panel";
import { SenderReadinessPanel } from "@/components/ops/sender-readiness-panel";
import { describeSenderReadiness } from "@/lib/sender-readiness";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import {
  isGoogleMailboxOAuthConfigured,
  isMicrosoftMailboxOAuthConfigured,
} from "@/server/mailbox/oauth-env";
import { getClientByIdForStaff } from "@/server/queries/clients";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;
  const sp = searchParams ? await searchParams : {};
  const mailboxOAuthResult =
    typeof sp.mailbox_oauth === "string"
      ? sp.mailbox_oauth
      : Array.isArray(sp.mailbox_oauth)
        ? sp.mailbox_oauth[0]
        : undefined;
  const mailboxOAuthReason =
    typeof sp.reason === "string" ? sp.reason : Array.isArray(sp.reason) ? sp.reason[0] : undefined;

  const client = await getClientByIdForStaff(clientId, accessible);
  if (!client) notFound();

  const canMutateMailboxes = await getClientMailboxMutationAllowed(staff, client.id);
  const oauthMicrosoftReady = isMicrosoftMailboxOAuthConfigured();
  const oauthGoogleReady = isGoogleMailboxOAuthConfigured();
  const mailboxRows = client.mailboxIdentities.map((m) => ({
    id: m.id,
    email: m.email,
    displayName: m.displayName,
    provider: m.provider,
    connectionStatus: m.connectionStatus,
    providerLinkedUserId: m.providerLinkedUserId,
    connectedAt: m.connectedAt?.toISOString() ?? null,
    isActive: m.isActive,
    isPrimary: m.isPrimary,
    canSend: m.canSend,
    canReceive: m.canReceive,
    dailySendCap: m.dailySendCap,
    isSendingEnabled: m.isSendingEnabled,
    emailsSentToday: m.emailsSentToday,
    dailyWindowResetAt: m.dailyWindowResetAt?.toISOString() ?? null,
    lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    lastError: m.lastError,
    updatedAt: m.updatedAt.toISOString(),
  }));

  const senderReport = describeSenderReadiness({
    defaultSenderEmail: client.defaultSenderEmail,
    senderIdentityStatus: client.senderIdentityStatus,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Client workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
          <p className="mt-1 text-muted-foreground">
            Slug <span className="font-mono text-foreground">{client.slug}</span> ·{" "}
            <Badge variant="outline">{client.status}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/contacts?client=${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Contacts
          </Link>
          <Link
            href={`/suppression?client=${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Suppression
          </Link>
          <Link
            href={`/activity?client=${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Activity
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Contacts</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {client._count.contacts}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Suppressed emails</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {client._count.suppressedEmails}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Campaigns</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {client._count.campaigns}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Outbound sender identity</CardTitle>
          <CardDescription>
            Configured vs verified vs allowlisted — operational sending only (not CRM).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SenderReadinessPanel report={senderReport} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Mailbox identities</CardTitle>
          <CardDescription>
            Connect each mailbox to Microsoft 365 or Google Workspace with OAuth (tokens stay on the
            server). Up to five active identities; default send cap 30/day per mailbox. Outbound
            sending and reply sync are not enabled yet — connection is for lifecycle and readiness
            only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMailboxIdentitiesPanel
            clientId={client.id}
            rows={mailboxRows}
            canMutate={canMutateMailboxes}
            oauthMicrosoftConfigured={oauthMicrosoftReady}
            oauthGoogleConfigured={oauthGoogleReady}
            mailboxOAuthBanner={
              mailboxOAuthResult === "connected"
                ? { type: "ok" as const, text: "Mailbox OAuth completed — connection status updated." }
                : mailboxOAuthResult === "error"
                  ? {
                      type: "err" as const,
                      text:
                        mailboxOAuthReason === "staff_session"
                          ? "Sign in to OpensDoors, then run mailbox connection again."
                          : "Mailbox OAuth did not complete. Check the last error on the row or retry connection.",
                    }
                  : null
            }
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Onboarding snapshot</CardTitle>
          <CardDescription>Captured during workspace creation</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {client.onboarding ? (
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 text-xs text-foreground">
              {JSON.stringify(client.onboarding.formData, null, 2)}
            </pre>
          ) : (
            <p>No onboarding record.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
