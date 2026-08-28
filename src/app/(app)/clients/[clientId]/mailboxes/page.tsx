import { notFound } from "next/navigation";

import { ClientMailboxIdentitiesPanel } from "@/components/clients/client-mailbox-identities-panel";
import { ClientSendPacingCard } from "@/components/clients/client-send-pacing-card";
import { InternalProofSendCard } from "@/components/clients/internal-proof-send-card";
import {
  MicrosoftAdminConsentHelp,
  type AdminConsentEntry,
} from "@/components/clients/microsoft-admin-consent-help";
import {
  ClientDeliverabilityHelp,
  type ClientDeliverabilityEntry,
  type MailboxProvider,
} from "@/components/clients/client-deliverability-help";
import { buildMicrosoftAdminConsentUrl } from "@/server/mailbox/microsoft-mailbox-oauth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  mailboxOAuthBanner,
  readMailboxOAuthSearchParams,
} from "@/lib/mailboxes/mailbox-oauth-banner-message";
import {
  MAILBOXES_PAGE_INTRO,
  MAILBOXES_PAGE_SUBTITLE,
  MAILBOXES_WHAT_HAPPENS_BULLETS,
} from "@/lib/mailboxes/mailbox-workspace-model";
import { canAccessMailboxSetupTools } from "@/lib/mailboxes/mailbox-setup-access";
import { prisma } from "@/lib/db";
import { resolvePublicBaseUrl } from "@/lib/unsubscribe/one-click-readiness";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientMailboxesPage({ params, searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;
  const sp = searchParams ? await searchParams : {};
  const oauthParams = readMailboxOAuthSearchParams(sp);

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;
  const showMailboxSetupTools = canAccessMailboxSetupTools(staff);
  const publicSiteOrigin = resolvePublicBaseUrl();

  // Tenant-wide admin-consent helper: one entry per distinct Microsoft mailbox
  // domain, so staff can hand the customer's IT admin a ready-made approval
  // link when the owner hits Microsoft's "Need admin approval" screen.
  const adminConsentEntries: AdminConsentEntry[] = bundle.oauthMicrosoftReady
    ? Array.from(
        new Set(
          bundle.mailboxRows
            .filter((m) => m.provider === "MICROSOFT")
            .map((m) => m.email.split("@")[1]?.trim().toLowerCase())
            .filter((d): d is string => Boolean(d)),
        ),
      )
        .map((domain) => {
          const url = buildMicrosoftAdminConsentUrl(domain);
          return url ? { domain, url } : null;
        })
        .filter((e): e is AdminConsentEntry => e !== null)
    : [];

  // Deliverability help — one entry per distinct sending domain, with how that
  // domain sends (M365 / Google / mixed) so staff can hand the customer the
  // right SPF/DKIM/DMARC steps (or a ready-made email) to get outreach into the
  // inbox. No subdomain required — this is the standard auth the domain already
  // needs. Provider is derived from the connected mailboxes on that domain.
  const providerByDomain = new Map<string, MailboxProvider>();
  for (const m of bundle.mailboxRows) {
    const domain = m.email.split("@")[1]?.trim().toLowerCase();
    if (!domain) continue;
    const prov: MailboxProvider = m.provider === "GOOGLE" ? "GOOGLE" : "MICROSOFT";
    const prev = providerByDomain.get(domain);
    providerByDomain.set(domain, !prev || prev === prov ? prov : "MIXED");
  }
  const deliverabilityEntries: ClientDeliverabilityEntry[] = Array.from(
    providerByDomain.entries(),
  ).map(([domain, provider]) => ({ domain, provider }));

  /*
    The banner after an OAuth round-trip.

    Two facts must come from the database and not from the URL: whether the
    mailbox really connected (a read-model overlay must not decide success), and
    which provider it is. The provider one is why this banner spent a year
    telling people connecting a Google mailbox to check Microsoft — the message
    was written when Microsoft was the only provider, and the row was never
    asked. The callbacks now put `oauth_mailbox_id` on every redirect, and it is
    re-read here, scoped to this workspace.
  */
  const oauthRow = oauthParams.mailboxId
    ? await prisma.clientMailboxIdentity.findFirst({
        where: { id: oauthParams.mailboxId, clientId },
        select: { connectionStatus: true, provider: true, email: true },
      })
    : null;

  const mailboxOAuthResultBanner = mailboxOAuthBanner({
    result: oauthParams.result,
    reason: oauthParams.reason,
    provider: oauthRow?.provider ?? null,
    mailboxEmail: oauthRow?.email ?? null,
    approvedEmail: oauthParams.approvedEmail,
    verifiedConnected: oauthRow?.connectionStatus === "CONNECTED",
    hasMailboxId: Boolean(oauthParams.mailboxId),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Mailboxes
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {MAILBOXES_PAGE_SUBTITLE} — {client.name}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {MAILBOXES_PAGE_INTRO}
        </p>
        {!showMailboxSetupTools ? (
          <p className="mt-3 max-w-3xl rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Connected senders and today&rsquo;s remaining send capacity. Signature setup and
            mailbox verification sends are owner-only — ask the owner account if something needs changing.
          </p>
        ) : null}
      </div>

      {/*
        The mailboxes come first. Until 2026-08-27 this page opened with four
        screens of setup and DNS documentation — good writing, wrong order — and
        you had to scroll past all of it to reach the thing the page is named
        after. The help is all still here, one screen down, closed by default.
      */}
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-6">
          <ClientMailboxIdentitiesPanel
            clientId={client.id}
            rows={bundle.mailboxRows}
            canMutate={bundle.canMutateMailboxes}
            oauthMicrosoftConfigured={bundle.oauthMicrosoftReady}
            oauthGoogleConfigured={bundle.oauthGoogleReady}
            sendingReadinessByMailboxId={bundle.sendingReadinessByMailboxId}
            senderReport={bundle.senderReport}
            aggregateRemaining={bundle.aggregateRemaining}
            showMailboxSetupTools={showMailboxSetupTools}
            workspaceDisplayName={client.name}
            publicSiteOrigin={publicSiteOrigin}
            clientSignaturePhone={client.signaturePhone ?? null}
            showAdvancedDiagnostics={staff.isSuperAdmin}
            clientBriefFallback={{
              senderDisplayNameFallback: client.name,
              emailSignatureFallback:
                typeof bundle.brief.emailSignature === "string" &&
                bundle.brief.emailSignature.trim().length > 0
                  ? bundle.brief.emailSignature
                  : null,
            }}
            mailboxOAuthBanner={mailboxOAuthResultBanner}
          />
        </CardContent>
      </Card>

      {/*
        How fast this workspace's mail leaves. Sits directly under the mailboxes
        because it is a property of how they send, not of the sequences.
      */}
      <ClientSendPacingCard
        clientId={client.id}
        sendBatchSize={client.sendBatchSize ?? null}
        canMutate={bundle.canMutateMailboxes}
      />

      <details className="group rounded-lg border border-border/80 bg-card px-4 py-3 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold text-foreground">
          Setup, deliverability and test sends
        </summary>
        <p className="mt-1 text-sm text-muted-foreground">
          What connecting a mailbox does, how to get a Microsoft admin to approve
          it, the SPF/DKIM/DMARC steps for each sending domain, and the
          verification-send tool. Open this when you are setting a mailbox up or
          something is not working.
        </p>
        <div className="mt-4 space-y-6">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">What happens when you connect a mailbox?</CardTitle>
              <CardDescription>
                Plain-English summary. Use this before you click Connect on a row.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {MAILBOXES_WHAT_HAPPENS_BULLETS.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {adminConsentEntries.length > 0 ? (
            <MicrosoftAdminConsentHelp entries={adminConsentEntries} />
          ) : null}

          {deliverabilityEntries.length > 0 ? (
            <ClientDeliverabilityHelp entries={deliverabilityEntries} />
          ) : null}

          {showMailboxSetupTools ? (
            <InternalProofSendCard
              clientId={client.id}
              rows={bundle.mailboxRows}
              sendingReadinessByMailboxId={bundle.sendingReadinessByMailboxId}
              canMutate={bundle.canMutateMailboxes}
              oauthMicrosoftConfigured={bundle.oauthMicrosoftReady}
              oauthGoogleConfigured={bundle.oauthGoogleReady}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}
