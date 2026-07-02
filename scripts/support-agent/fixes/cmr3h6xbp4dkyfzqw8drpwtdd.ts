import { getPrisma } from "../_db";

/**
 * Support ticket cmr3h6xbp4dkyfzqw8drpwtdd — Lucy asked for three more internal
 * test inboxes to be exempt from the workspace 10-day re-contact cooldown, the
 * same way the existing internal seed/allowlist addresses already are (see
 * `InternalSeedAddress` / `src/server/internal-seed/seed-allowlist.ts`).
 *
 * She listed "Danielle@opesndoors.co.uk" — a transposed-letter typo of the
 * company's own domain used by every other address in the ticket and by her
 * own address. Adding it under the corrected domain; flagged in the reporter
 * reply so she can tell us if that's wrong.
 *
 * Idempotent: `upsertInternalSeedAddress` upserts on the unique `email`, so
 * re-running this is a no-op once the rows exist. Targets exactly the three
 * named addresses — nothing else.
 *
 * Usage: tsx scripts/support-agent/fixes/cmr3h6xbp4dkyfzqw8drpwtdd.ts [--apply]
 * Without --apply it only prints the before-state and what would change.
 */

const TARGET_ADDRESSES = [
  { email: "danielle@opensdoors.co.uk", label: "Danielle (internal test)" },
  { email: "jack@opensdoors.co.uk", label: "Jack (internal test)" },
  { email: "sophie@opensdoors.co.uk", label: "Sophie (internal test)" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = await getPrisma();

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  for (const target of TARGET_ADDRESSES) {
    const before = await prisma.internalSeedAddress.findUnique({
      where: { email: target.email },
    });
    console.log(
      `- ${target.email}: before=${before ? JSON.stringify(before) : "absent"}`,
    );
    if (!apply) {
      console.log(
        `  would upsert: { email: "${target.email}", label: "${target.label}", note: "Internal test address — added per support ticket cmr3h6xbp4dkyfzqw8drpwtdd", isActive: true }`,
      );
      continue;
    }
    const after = await prisma.internalSeedAddress.upsert({
      where: { email: target.email },
      create: {
        email: target.email,
        label: target.label,
        note: "Internal test address — added per support ticket cmr3h6xbp4dkyfzqw8drpwtdd",
        isActive: true,
      },
      update: {
        isActive: true,
      },
    });
    console.log(`  after=${JSON.stringify(after)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
