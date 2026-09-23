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
  inspectClientMailboxSignatures,
  inspectMailboxSignature,
} from "@/lib/support/mailbox-signature-inspection";

function flag(name: string): string {
  const i = process.argv.indexOf(name);
  return i > -1 ? (process.argv[i + 1] ?? "") : "";
}

type MailboxRow = {
  id: string;
  email: string;
  displayName: string | null;
  provider: "MICROSOFT" | "GOOGLE";
  connectionStatus:
    | "DRAFT"
    | "PENDING_CONNECTION"
    | "CONNECTED"
    | "CONNECTION_ERROR"
    | "DISCONNECTED";
  isSendingEnabled: boolean;
  lastError: string | null;
  senderDisplayName: string | null;
  senderPhone: string | null;
  senderSignatureHtml: string | null;
  senderSignatureText: string | null;
  senderSignatureSource: string | null;
  senderSignatureSyncedAt: Date | null;
  senderSignatureSyncError: string | null;
};

function mailboxInput(row: MailboxRow) {
  return {
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
  };
}

const mailboxSelect = {
  id: true,
  email: true,
  displayName: true,
  provider: true,
  connectionStatus: true,
  isSendingEnabled: true,
  lastError: true,
  senderDisplayName: true,
  senderPhone: true,
  senderSignatureHtml: true,
  senderSignatureText: true,
  senderSignatureSource: true,
  senderSignatureSyncedAt: true,
  senderSignatureSyncError: true,
} as const;

async function main() {
  const clientSlug = flag("--client-slug").trim();
  const mailboxId = flag("--mailbox-id").trim();
  if (!clientSlug && !mailboxId) {
    throw new Error(
      "usage: inspect-mailbox-signature --client-slug <slug> | --mailbox-id <id>",
    );
  }

  const prisma = await getPrisma();

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
    const client = row.client;
    const emails = await prisma.clientMailboxIdentity.findMany({
      where: { clientId: client.id, workspaceRemovedAt: null },
      select: { email: true },
    });
    const report = inspectMailboxSignature({
      client,
      mailbox: mailboxInput(row),
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
        select: mailboxSelect,
      },
    },
  });
  if (!found) throw new Error(`client slug ${clientSlug} not found`);

  const report = inspectClientMailboxSignatures(
    found,
    found.mailboxIdentities.map((row) => mailboxInput(row)),
  );
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
