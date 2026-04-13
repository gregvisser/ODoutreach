import "dotenv/config";

import { processOutboundSendQueue } from "../src/server/email/outbound/queue-processor";

async function main() {
  const limit = Math.min(
    Math.max(parseInt(process.argv[2] ?? "20", 10) || 20, 1),
    50,
  );
  const result = await processOutboundSendQueue({ limit });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
