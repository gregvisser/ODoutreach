/**
 * The support-agent work queue: every OPEN ticket as JSON.
 *
 * Ordered highest-priority-first (CRITICAL -> LOW), oldest-first within a
 * priority. The priority enum is declared LOW..CRITICAL in the schema, so
 * ordering it `desc` yields CRITICAL first.
 *
 *   npm run support:list
 */
import { getPrisma } from "./_db";

async function main() {
  const prisma = await getPrisma();
  const tickets = await prisma.supportTicket.findMany({
    where: { status: "OPEN" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      reporterEmail: true,
      createdAt: true,
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      },
    },
  });
  console.log(JSON.stringify(tickets, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
