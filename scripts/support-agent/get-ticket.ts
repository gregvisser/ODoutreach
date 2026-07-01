/**
 * Load one support ticket in full, and dump its screenshot attachments to
 * `.tmp/support-agent/` so they can be viewed. `.tmp/` is gitignored — the
 * dumped bytes can contain user data and must never be committed.
 *
 *   npm run support:get <ticketId>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getPrisma } from "./_db";

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("usage: get-ticket <ticketId>");
  const prisma = await getPrisma();
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      attachments: true,
      createdBy: { select: { displayName: true, email: true } },
    },
  });
  if (!ticket) throw new Error(`ticket ${id} not found`);

  mkdirSync(".tmp/support-agent", { recursive: true });
  const attachments = ticket.attachments.map((a) => {
    const ext = (a.mimeType.split("/")[1] ?? "png").replace("jpeg", "jpg");
    const savedTo = `.tmp/support-agent/${a.id}.${ext}`;
    writeFileSync(savedTo, Buffer.from(a.data));
    return {
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      savedTo,
    };
  });

  console.log(JSON.stringify({ ...ticket, attachments }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
