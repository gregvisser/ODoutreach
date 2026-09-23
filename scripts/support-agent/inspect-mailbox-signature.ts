/**
 * Read-only production mailbox signature inspection for the support agent.
 *
 * Does not send mail, sync Gmail, or mutate data. Use mailbox id (not email) in
 * CI argv so the Grok allowlist does not treat addresses as secrets.
 *
 *   npm run support:inspect-mailbox-signature -- --client-slug morson-fm
 *   npm run support:inspect-mailbox-signature -- --mailbox-id <cuid>
 */
import { getPrisma } from "./_db";
import {
  inspectMailboxSignature,
  summarizeClientMailboxesForSupport,
} from "@/lib/support/mailbox-signature-inspection";

function flag(name: string): string {
  const i = process.argv.indexOf(name);
  return i > -1 ? (process.argv[i + 1] ?? "") : "";
}

async function main() {
  const clientSlug = flag("--client-slug").trim();
  const mailboxId = flag("--mailbox-id").trim();
  if (!clientSlug && !mailboxId) {
    throw new Error(
      "usage: inspect-mailbox-signature --client-slug <slug> | --mailbox-id <id> [--mailbox-id <id>]",
    );
  }

  const prisma = await getPrisma();

  let client:
    | {
        id: string;
        slug: string;
        name: string;
        website: string | null;
        logoUrl: string | null;
        signaturePhone: string | null;
      }
    | null = null;

  if (mailboxId) {
    const row = await prisma.clientMailboxIdentity.findUnique({
      where: { id: mailboxId },
      include: {
        client: {
          select: {
            id: true,
            slug: true,
            name: true,
            website: true,
            logoUrl: true,
            signaturePhone: true,
          },
        },
      },
    });
    if (!row) throw new Error(`mailbox ${mailboxId} not found`);
    client = row.client;
    const emails = await prisma.clientMailboxIdentity.findMany({
      where: { clientId: client.id, workspaceRemovedAt: null },
      select: { email: true },
    });
    const report = inspectMailboxSignature({
      client,
      mailbox: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        provider: row.provider,
        connectionStatus: row.connectionStatus,
        isSendingEnabled: row.isSendingEnabled,
        lastError: row.lastError,
        senderDisplayName: row.senderDisplayName,
        senderPhone: row.senderPhone,
        senderSignatureHtml: row.senderSignatureHtml,
        senderSignatureText: row.senderSignatureText,
        senderSignatureSource: row.senderSignatureSource,
        senderSignatureSyncedAt: row.senderSignatureSyncedAt,
        senderSignatureSyncError: row.senderSignatureSyncError,
      },
      allMailboxEmails: emails.map((e) => e.email),
    });
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    return;
  }

  const found = await prisma.client.findUnique({
    where: { slug: clientSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      website: true,
      logoUrl: true,
      signaturePhone: true,
      mailboxIdentities: {
        where: { workspaceRemovedAt: null },
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          provider: true,
          connectionStatus: true,
          senderSignatureHtml: true,
          senderSignatureText: true,
          senderSignatureSource: true,
        },
      },
    },
  });
  if (!found) throw new Error(`client slug ${clientSlug} not found`);

  if (found.mailboxIdentities.length === 1) {
    const row = await prisma.clientMailboxIdentity.findUnique({
      where: { id: found.mailboxIdentities[0]!.id },
    });
    if (!row) throw new Error("mailbox row missing");
    const emails = found.mailboxIdentities.map((m) => m.email);
    const report = inspectMailboxSignature({
      client: found,
      mailbox: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        provider: row.provider,
        connectionStatus: row.connectionStatus,
        isSendingEnabled: row.isSendingEnabled,
        lastError: row.lastError,
        senderDisplayName: row.senderDisplayName,
        senderPhone: row.senderPhone,
        senderSignatureHtml: row.senderSignatureHtml,
        senderSignatureText: row.senderSignatureText,
        senderSignatureSource: row.senderSignatureSource,
        senderSignatureSyncedAt: row.senderSignatureSyncedAt,
        senderSignatureSyncError: row.senderSignatureSyncError,
      },
      allMailboxEmails: emails,
    });
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    return;
  }

  const summary = summarizeClientMailboxesForSupport(
    { id: found.id, slug: found.slug, name: found.name },
    found.mailboxIdentities,
  );
  console.log(
    JSON.stringify(
      {
        ...summary,
        hint: "Pass --mailbox-id <id> for full signature diagnostics on one mailbox.",
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
