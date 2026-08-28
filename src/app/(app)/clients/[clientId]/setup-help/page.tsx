import { notFound } from "next/navigation";
import Link from "next/link";

import {
  ClientDeliverabilityHelp,
} from "@/components/clients/client-deliverability-help";
import {
  MicrosoftAdminConsentHelp,
  type AdminConsentEntry,
} from "@/components/clients/microsoft-admin-consent-help";
import { resolveClientHelpDomains } from "@/lib/clients/client-help-domains";
import { prisma } from "@/lib/db";
import { buildMicrosoftAdminConsentUrl } from "@/server/mailbox/microsoft-mailbox-oauth";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { canAccessClient } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

/**
 * Setup help — the two things staff hand a customer's IT department, on EVERY
 * client account, whatever state its mailboxes are in.
 *
 * Why this page exists (owner request, 2026-08-28): both panels already
 * existed and were good, but they lived on the Mailboxes tab behind a closed
 * `<details>`, and each was wrapped in a `length > 0` check driven by the
 * CONNECTED MAILBOXES. So a client with no mailbox connected saw neither — the
 * exact moment staff need them, because these instructions are how a mailbox
 * gets connected and how its mail stops going to spam.
 *
 * Deliberately a lean query rather than `loadClientWorkspaceBundle`: this page
 * needs four fields and the mailbox addresses, and the workspace bundle runs
 * a page's worth of reporting queries this screen would throw away.
 */

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientSetupHelpPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const { clientId } = await params;
  if (!(await canAccessClient(staff, clientId))) notFound();

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      id: true,
      name: true,
      website: true,
      defaultSenderEmail: true,
      mailboxIdentities: {
        select: { email: true, provider: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!client) notFound();

  const help = resolveClientHelpDomains({
    mailboxes: client.mailboxIdentities,
    website: client.website,
    defaultSenderEmail: client.defaultSenderEmail,
  });

  // A consent URL needs the Microsoft OAuth app to be configured on our side.
  // When it is not, `buildMicrosoftAdminConsentUrl` returns null and we tell
  // staff that rather than showing an empty card.
  const adminConsentEntries: AdminConsentEntry[] = help.microsoftDomains
    .map((domain) => {
      const url = buildMicrosoftAdminConsentUrl(domain);
      return url ? { domain, url } : null;
    })
    .filter((entry): entry is AdminConsentEntry => entry !== null);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Setup help
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What to send {client.name}&rsquo;s IT department
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Two things hold up almost every new account: Microsoft refusing to let the
          mailbox connect until an administrator approves us, and outreach landing in
          spam because the sending domain has not finished proving it sends its own
          email. Both are fixed by the customer&rsquo;s own IT, and both are explained
          below with the exact steps and records already filled in for{" "}
          {client.name}. You do not need to understand them — press{" "}
          <em>Copy email</em> and forward it.
        </p>
      </div>

      <MicrosoftAdminConsentHelp
        entries={adminConsentEntries}
        unresolvedDomain={adminConsentEntries.length === 0}
      />

      <ClientDeliverabilityHelp
        entries={help.deliverability}
        domainSource={help.source}
      />

      <p className="text-sm text-muted-foreground">
        Connecting and checking mailboxes happens on the{" "}
        <Link
          href={`/clients/${client.id}/mailboxes`}
          prefetch={false}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Mailboxes
        </Link>{" "}
        tab.
      </p>
    </div>
  );
}
