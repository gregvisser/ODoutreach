/**
 * Mock-send report (READ-ONLY).
 *
 * Answers brief question P0-1: has any outbound email been recorded as SENT
 * while actually going through `MockEmailProvider`, which returns a
 * `mock_<hash>` id and never touches the network?
 *
 * Background: `EMAIL_PROVIDER` is unset in production, so
 * `src/server/email/providers/index.ts` falls through to its `mock` default.
 * Rows WITH a `mailboxIdentityId` are unaffected — real client outreach goes
 * via Microsoft Graph or Gmail and never reaches the provider factory. Rows
 * WITHOUT one (legacy / non-mailbox) do reach it.
 *
 * Any row this reports is an email the system told an operator it had sent and
 * never sent.
 *
 * This script ONLY reads. It changes nothing.
 *
 *   Run:  DATABASE_URL=... npx tsx scripts/ops-mock-send-report.ts
 */
import { prisma } from "@/lib/db";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

async function main(): Promise<void> {
  const rows = await prisma.outboundEmail.findMany({
    where: { providerMessageId: { startsWith: "mock_" } },
    select: {
      id: true,
      clientId: true,
      toEmail: true,
      subject: true,
      status: true,
      providerName: true,
      mailboxIdentityId: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    console.log("\nRESULT: 0 rows with a mock_ providerMessageId.");
    console.log(
      "No outbound email has been recorded as sent via the mock provider.",
    );
    console.log(
      "P0-1 is a latent configuration risk only — no delivery was affected.\n",
    );
    return;
  }

  console.log(`\nRESULT: ${rows.length} row(s) recorded as sent via the MOCK provider.`);
  console.log("These emails were reported as sent and never left the system.\n");

  console.log(`Earliest: ${iso(rows[0].createdAt)}`);
  console.log(`Latest:   ${iso(rows[rows.length - 1].createdAt)}\n`);

  const byClient = new Map<string, number>();
  let withMailbox = 0;
  for (const r of rows) {
    byClient.set(r.clientId, (byClient.get(r.clientId) ?? 0) + 1);
    if (r.mailboxIdentityId) withMailbox += 1;
  }

  console.log("Per client:");
  for (const [clientId, count] of [...byClient].sort((a, b) => b[1] - a[1])) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true },
    });
    console.log(`  ${client?.name ?? clientId}: ${count}`);
  }

  if (withMailbox > 0) {
    console.log(
      `\nUNEXPECTED: ${withMailbox} row(s) carry a mailboxIdentityId yet have a mock id.`,
    );
    console.log(
      "That contradicts the containment assumption — investigate before anything else.",
    );
  }

  console.log("\nFirst 20 affected sends:");
  for (const r of rows.slice(0, 20)) {
    console.log(
      `  ${iso(r.createdAt)}  ${r.status.padEnd(9)}  ${r.toEmail}  ${(r.subject ?? "").slice(0, 48)}`,
    );
  }
  if (rows.length > 20) console.log(`  … and ${rows.length - 20} more`);
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
