import "dotenv/config";

import { prisma } from "../../src/lib/db";
import { processSupportTicketNotificationQueue } from "../../src/server/support/support-ticket-notifications";

const limit = Number.parseInt(process.argv[2] ?? "10", 10);
async function main() {
  const result = await processSupportTicketNotificationQueue(Number.isFinite(limit) ? limit : 10);
  console.log(JSON.stringify(result));
  if (result.failed > 0 || result.unknown > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Support notification worker failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
