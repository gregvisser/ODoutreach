/**
 * One-time, hard-scoped fix for the sequence-launch refusal traced in
 * `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`: `bidlowai` has no
 * verified sender-aligned link domain, so the mailto unsubscribe fallback
 * (`buildUnsubscribePlaceholder` in `send-introduction.ts`) resolves to `""`
 * when `Client.defaultSenderEmail` is null — and it is null — so
 * `composeSequenceEmail` marks every send not-ready. Queue row 98,
 * `.bidlow/relay/QUEUE.md`. Greg approved this explicitly, in writing, in
 * that row: set `bidlowai`'s `Client.defaultSenderEmail` to
 * `greg@bidlow.co.uk`.
 *
 * SAFE-BY-DEFAULT, additive-only, hard-scoped to one client:
 *   - Refuses to run against any client other than slug "bidlowai".
 *   - The write is `updateMany({ where: { slug, defaultSenderEmail: null } })`
 *     — it can only ever move null -> the target value. If the field is
 *     already non-null and different, it refuses rather than overwrite.
 *   - If it is already set to the target value, the write is a no-op
 *     (idempotent re-run) and the script proceeds straight to the proof.
 *   - Requires CONFIRM to match exactly, unless DRY_RUN=1.
 *   - Writes an AuditLog row alongside the update, same convention as
 *     `retire-test-client.ts`.
 *
 * PROOF, not just an update() return: after writing, this script
 *   1. re-reads the row back from the database in a separate query, and
 *   2. re-runs the REAL composition path — `resolveClientLinkBaseUrl` and
 *      `composeSequenceEmail`, imported directly from `src/lib`, against a
 *      real template and a real enrolled contact already in the `bidlowai`
 *      workspace — and prints whether `sendReady` is now true and
 *      `unsubscribe_link` is populated.
 *
 *      Two small pieces of `src/server/email-sequences/send-introduction.ts`
 *      (`buildUnsubscribePlaceholder`, `buildSenderRow`) are reproduced
 *      inline below rather than imported, because that whole module (like
 *      almost everything under `src/server/`) starts with `import
 *      "server-only"` — a Next.js-provided bare specifier that only Next's
 *      own bundler can resolve; there is no real `server-only` package in
 *      `node_modules`, so importing it from a plain `tsx` script fails with
 *      `MODULE_NOT_FOUND` (confirmed by trying it — see the first, reverted
 *      version of this script). Every existing ops script in this
 *      directory avoids `src/server/*` for the same reason. The two
 *      reproduced functions are pure one-liners; see
 *      send-introduction.ts:263-268 and :270-305 for the originals this
 *      mirrors exactly.
 *
 * This script sends nothing and creates no OutboundEmail row — it only
 * reads real data and calls the same pure composition function the real
 * dispatcher calls, without going through the dispatch transaction.
 *
 * Usage:
 *   # Dry-run: prints the plan, performs no write.
 *   DRY_RUN=1 npm run ops:set-bidlowai-default-sender
 *
 *   # Perform the write + proof.
 *   CONFIRM="SET BIDLOWAI DEFAULT SENDER" npm run ops:set-bidlowai-default-sender
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { resolveClientLinkBaseUrl } from "../src/lib/clients/client-link-domain";
import {
  getClientSenderProfile,
  type ClientSenderProfile,
} from "../src/lib/opensdoors-brief";
import { composeSequenceEmail } from "../src/lib/email-sequences/sequence-email-composition";
import {
  chooseSignatureForSend,
  type SenderSignatureMailbox,
} from "../src/lib/mailboxes/sender-signature";
import { isEffectivePrimaryMailbox } from "../src/lib/mailbox-identities";
import type { ClientMailboxIdentity } from "../src/generated/prisma/client";

/** Mirrors send-introduction.ts:263-268 exactly (module-private there). */
function buildUnsubscribePlaceholder(
  clientDefaultSenderEmail: string | null,
): string {
  if (!clientDefaultSenderEmail) return "";
  return `mailto:${clientDefaultSenderEmail}?subject=unsubscribe`;
}

/** Mirrors send-introduction.ts:270-305 exactly (imports `server-only`, unimportable from plain tsx). */
function buildSenderRow(
  client: { name: string; defaultSenderEmail: string | null },
  brief: ClientSenderProfile,
  unsubscribeLink: string,
  mailbox?: SenderSignatureMailbox | null,
) {
  let senderName = client.name;
  let senderEmail: string | null = client.defaultSenderEmail;
  let emailSignature: string = brief.emailSignature;

  if (mailbox) {
    const sel = chooseSignatureForSend({
      mailbox,
      clientBrief: {
        senderDisplayNameFallback: null,
        emailSignatureFallback: null,
      },
    });
    senderName = sel.senderDisplayName ?? client.name;
    senderEmail = mailbox.email;
    emailSignature = sel.emailSignatureText ?? "";
  }

  return {
    senderName,
    senderEmail,
    senderCompanyName: brief.senderCompanyName,
    emailSignature,
    unsubscribeLink: unsubscribeLink.length > 0 ? unsubscribeLink : null,
  };
}

/**
 * Simplified stand-in for `eligibleWorkspaceMailboxPool`
 * (`src/server/mailbox/sending-policy.ts`, also `server-only`-guarded and
 * therefore unimportable here): a mailbox actually eligible to receive real
 * dispatch traffic. Not the full governance policy (daily caps, pacing,
 * warmup) — this script never sends anything, it only needs ONE real
 * mailbox row to populate the sender identity fields for the composition
 * proof.
 */
function pickCompositionMailbox(
  identities: ClientMailboxIdentity[],
): ClientMailboxIdentity | null {
  const candidates = identities.filter(
    (m) => m.isActive && m.isSendingEnabled && m.connectionStatus === "CONNECTED",
  );
  if (candidates.length === 0) return null;
  return candidates.find((m) => isEffectivePrimaryMailbox(m)) ?? candidates[0];
}

const ALLOWED_CLIENT_SLUG = "bidlowai";
const TARGET_EMAIL = "greg@bidlow.co.uk";
const CONFIRM_TOKEN = "SET BIDLOWAI DEFAULT SENDER";

function maskAddress(email: string | null | undefined): string {
  if (!email) return "(none)";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

const CLIENT_SELECT = {
  id: true,
  slug: true,
  name: true,
  defaultSenderEmail: true,
  outreachLinkDomain: true,
  outreachLinkDomainVerifiedAt: true,
  onboarding: { select: { formData: true } },
} as const;

async function loadClient() {
  return prisma.client.findUnique({
    where: { slug: ALLOWED_CLIENT_SLUG },
    select: CLIENT_SELECT,
  });
}

/**
 * Re-runs the real dispatch-time composition path against a real template +
 * real enrolled contact already in the workspace, proving `sendReady` and
 * `unsubscribe_link` off the row this script just wrote — not a synthetic
 * example.
 */
async function proveComposition(
  client: NonNullable<Awaited<ReturnType<typeof loadClient>>>,
) {
  const identities = await prisma.clientMailboxIdentity.findMany({
    where: { clientId: client.id },
  });
  const mailbox = pickCompositionMailbox(identities);
  if (!mailbox) {
    console.log(
      "\n[proof] SKIPPED — no eligible connected mailbox in the bidlowai workspace, " +
        "so the real sender row cannot be built. This is unrelated to defaultSenderEmail.",
    );
    return;
  }

  const sequence = await prisma.clientEmailSequence.findFirst({
    where: {
      clientId: client.id,
      steps: { some: { category: "INTRODUCTION" } },
      enrollments: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      steps: {
        where: { category: "INTRODUCTION" },
        include: { template: true },
      },
      enrollments: { take: 1, include: { contact: true } },
    },
  });

  let template = sequence?.steps[0]?.template ?? null;
  let contact = sequence?.enrollments[0]?.contact ?? null;
  let sourceNote = sequence
    ? `sequence "${sequence.name}" (${sequence.id})`
    : null;

  if (!template) {
    const step = await prisma.clientEmailSequenceStep.findFirst({
      where: { sequence: { clientId: client.id }, category: "INTRODUCTION" },
      orderBy: { updatedAt: "desc" },
      include: { template: true },
    });
    template = step?.template ?? null;
    sourceNote = step ? `fallback: any INTRODUCTION step (${step.id}) — no enrolled sequence found` : null;
  }
  if (!contact) {
    contact = await prisma.contact.findFirst({
      where: { clientId: client.id },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (!template || !contact) {
    console.log(
      `\n[proof] SKIPPED — no ${!template ? "INTRODUCTION template" : "contact"} found in the ` +
        "bidlowai workspace to compose against. The field write above still stands; " +
        "this only means there was no real send artefact left to re-check it with.",
    );
    return;
  }

  const brief = getClientSenderProfile({
    client: { name: client.name },
    formData: client.onboarding?.formData ?? null,
  });

  // Mirrors send-introduction.ts:559-568 exactly.
  const alignedLinkBaseUrl = resolveClientLinkBaseUrl(client);
  const fallbackUnsubscribeLink = buildUnsubscribePlaceholder(
    client.defaultSenderEmail,
  );
  if (alignedLinkBaseUrl !== null) {
    console.log(
      "\n[proof] NOTE — bidlowai now has a verified aligned link domain, so the real " +
        "dispatch path would mint a hosted unsubscribe URL, not the mailto fallback this " +
        "script exercises. Proceeding with the mailto fallback anyway since that is the " +
        "exact defect this row was written to fix.",
    );
  }
  const unsubscribeUrlForSend = fallbackUnsubscribeLink;

  const senderRow = buildSenderRow(client, brief, unsubscribeUrlForSend, {
    provider: mailbox.provider,
    email: mailbox.email,
    displayName: mailbox.displayName,
    senderDisplayName: mailbox.senderDisplayName,
    senderSignatureHtml: mailbox.senderSignatureHtml,
    senderSignatureText: mailbox.senderSignatureText,
    senderSignatureSource: mailbox.senderSignatureSource,
    senderSignatureSyncedAt: mailbox.senderSignatureSyncedAt,
    senderSignatureSyncError: mailbox.senderSignatureSyncError,
  });

  const composition = composeSequenceEmail({
    subject: template.subject,
    content: template.content,
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: contact.fullName,
      company: contact.company,
      role: contact.title,
      website: null,
      email: contact.email,
      mobilePhone: contact.mobilePhone,
      officePhone: contact.officePhone,
    },
    sender: senderRow,
  });

  console.log(
    `\n[proof] Re-ran the real dispatch-time composition path against ${sourceNote}, ` +
      `template "${template.name}" (${template.id}), contact ${maskAddress(contact.email)} (${contact.id}), ` +
      `mailbox ${maskAddress(mailbox.email)}.`,
  );
  console.log(`[proof] alignedLinkBaseUrl = ${alignedLinkBaseUrl ?? "null"}`);
  console.log(`[proof] unsubscribe_link (sender.unsubscribeLink) = ${senderRow.unsubscribeLink ?? "null"}`);
  console.log(`[proof] composition.ok = ${composition.ok}`);
  console.log(`[proof] composition.sendReady = ${composition.sendReady}`);
  console.log(
    `[proof] composition.missingFields = ${JSON.stringify(composition.missingFields)}`,
  );

  if (composition.sendReady) {
    console.log(
      "\n[proof] PASS — sendReady is true and unsubscribe_link is populated. " +
        "The refusal traced in SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md is resolved " +
        "for this composition input.",
    );
  } else {
    console.log(
      "\n[proof] FAIL — sendReady is still false. defaultSenderEmail alone did not clear " +
        `the refusal. missingFields names the next cause: ${JSON.stringify(composition.missingFields)}.`,
    );
  }
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const confirm = process.env.CONFIRM?.trim();

  const before = await loadClient();
  if (!before) {
    console.error(
      `Refusing: no client with slug "${ALLOWED_CLIENT_SLUG}" was found. Nothing to do.`,
    );
    process.exit(2);
  }
  if (before.slug !== ALLOWED_CLIENT_SLUG) {
    // Unreachable given the query above, but this is the one field this
    // script is allowed to trust — assert it explicitly rather than assume.
    console.error(`Refusing: resolved client slug "${before.slug}" is not "${ALLOWED_CLIENT_SLUG}".`);
    process.exit(2);
  }

  console.log(
    `[ops-set-bidlowai-default-sender] client=${before.id} slug=${before.slug} name="${before.name}" ` +
      `defaultSenderEmail(before)=${before.defaultSenderEmail ?? "null"} dryRun=${dryRun ? "yes" : "no"}`,
  );

  if (before.defaultSenderEmail !== null && before.defaultSenderEmail !== TARGET_EMAIL) {
    console.error(
      `Refusing: defaultSenderEmail is already set to a DIFFERENT value ` +
        `(${maskAddress(before.defaultSenderEmail)}). This script only ever moves null -> ` +
        `"${TARGET_EMAIL}"; it will not overwrite an existing value. That is a human decision.`,
    );
    process.exit(4);
  }

  if (before.defaultSenderEmail === TARGET_EMAIL) {
    console.log(
      `\nAlready set to "${TARGET_EMAIL}" — idempotent re-run, no write performed. Proceeding to proof.`,
    );
    await proveComposition(before);
    return;
  }

  // before.defaultSenderEmail === null from here.
  if (dryRun) {
    console.log(
      `\nDRY_RUN=1 — would set defaultSenderEmail to "${TARGET_EMAIL}" for client ${before.id}. No write performed.`,
    );
    console.log(
      "\n[proof] Re-running the real composition path against the CURRENT (unwritten) row " +
        "first, to show the refusal red before any write — this is read-only.",
    );
    await proveComposition(before);
    return;
  }

  if (confirm !== CONFIRM_TOKEN) {
    console.error(
      `\nRefusing: set CONFIRM="${CONFIRM_TOKEN}" to proceed with the write. ` +
        "Alternatively pass DRY_RUN=1 for a read-only plan.",
    );
    process.exit(3);
  }

  const updateResult = await prisma.client.updateMany({
    where: { slug: ALLOWED_CLIENT_SLUG, defaultSenderEmail: null },
    data: { defaultSenderEmail: TARGET_EMAIL },
  });
  if (updateResult.count !== 1) {
    console.error(
      `Refusing to proceed: expected to update exactly 1 row scoped to slug="${ALLOWED_CLIENT_SLUG}" ` +
        `AND defaultSenderEmail IS NULL, but updateMany matched ${updateResult.count}. ` +
        "Another actor may have changed this row concurrently — not treating this as success.",
    );
    process.exit(5);
  }

  await prisma.auditLog.create({
    data: {
      clientId: before.id,
      action: "UPDATE",
      entityType: "Client",
      entityId: before.id,
      metadata: {
        reason: "ops-set-bidlowai-default-sender script — QUEUE.md row 98, Greg-approved 2026-08-29",
        field: "defaultSenderEmail",
        previousValue: before.defaultSenderEmail,
        newValue: TARGET_EMAIL,
        confirmationToken: CONFIRM_TOKEN,
        scriptVersion: 1,
      },
    },
  });

  // Read back from a fresh query — not the update() return — to prove the
  // write actually persisted rather than trusting a row count.
  const after = await loadClient();
  console.log(
    `\ndefaultSenderEmail(after, re-read from a fresh query) = ${after?.defaultSenderEmail ?? "null"}`,
  );
  if (after?.defaultSenderEmail !== TARGET_EMAIL) {
    console.error(
      `FAIL: read-back value "${after?.defaultSenderEmail ?? "null"}" does not equal the target ` +
        `"${TARGET_EMAIL}". The update() call reported success but the persisted value disagrees.`,
    );
    process.exit(6);
  }
  console.log("Write confirmed by independent read-back. AuditLog entry recorded.");

  await proveComposition(after);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
