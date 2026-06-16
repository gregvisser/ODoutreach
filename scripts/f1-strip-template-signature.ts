/**
 * F1 reviewed migration — strip `{{email_signature}}` from existing email
 * templates.
 *
 * A signature is a property of the sending mailbox and is appended at send;
 * a template must not embed one (the brief's "no template still contains a
 * signature block"). The transmit path already de-dupes a trailing signature
 * (`stripTrailingPlainSignature` in outreach-mailbox-bodies.ts), so this is
 * cleanup — removing the token does NOT change the email a recipient gets
 * (the mailbox signature is still appended once).
 *
 * DRY RUN by default (READ-ONLY): lists every ClientEmailTemplate whose
 * content contains the token, with its status, for review. Pass `--apply` to
 * strip it — a CONTENT MUTATION, so Greg's sign-off (Prime Directive).
 * Idempotent: re-running is a no-op once stripped.
 *
 *   List:   npx tsx scripts/f1-strip-template-signature.ts
 *   Apply:  npx tsx scripts/f1-strip-template-signature.ts --apply
 */
import { prisma } from "@/lib/db";
import {
  contentHasSignatureToken,
  stripSignatureToken,
} from "@/lib/email-templates/strip-signature-token";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const templates = await prisma.clientEmailTemplate.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      status: true,
      content: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const affected = templates.filter((t) => contentHasSignatureToken(t.content));

  console.log(
    `=== F1 template {{email_signature}} strip (${apply ? "APPLY" : "DRY RUN"}) ===`,
  );
  console.log(
    `Scanned ${templates.length} templates; ${affected.length} contain the token.`,
  );
  if (affected.length === 0) {
    console.log("Nothing to strip.");
    return;
  }
  console.log("");
  for (const t of affected) {
    console.log(
      `- client="${t.client.name}"  template=${t.id}  status=${t.status}  [${t.category}]  "${t.name}"`,
    );
    if (apply) {
      await prisma.clientEmailTemplate.update({
        where: { id: t.id },
        data: { content: stripSignatureToken(t.content) },
      });
    }
  }
  console.log(
    apply
      ? `\nStripped ${affected.length} template(s). The mailbox signature is still appended at send.`
      : `\nDRY RUN — no changes made. Review the list above, then re-run with --apply (Greg sign-off).`,
  );
}

main()
  .catch((e) => {
    console.error("f1-strip-template-signature failed:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
