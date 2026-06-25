import "server-only";

import type {
  ClientEmailTemplateCategory,
  StaffUser,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isEffectivePrimaryMailbox } from "@/lib/mailbox-identities";
import { getClientSenderProfile } from "@/lib/opensdoors-brief";
import type { SequenceCompositionContact } from "@/lib/email-sequences/sequence-email-composition";
import {
  renderOutreachEmail,
  type RenderedOutreachEmail,
} from "@/lib/email-rendering/render-outreach-email";
import { resolvePublicBaseUrl } from "@/lib/unsubscribe/one-click-readiness";
import { buildSenderRow } from "@/server/email-sequences/send-introduction";
import { eligibleWorkspaceMailboxPool } from "@/server/mailbox/sending-policy";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Feature B (production hardening) — pre-send preview loader.
 *
 * Builds the EXACT inputs the live send path builds (template, resolved sender
 * identity via the same `buildSenderRow`, the chosen mailbox's real signature)
 * and renders them through `renderOutreachEmail` — the same primitives the
 * worker uses. Flag-gated by `PRE_SEND_PREVIEW_ENABLED`; when off the loader is
 * never invoked and nothing about the live send path changes.
 */

export function isPreSendPreviewEnabled(): boolean {
  return (
    (process.env.PRE_SEND_PREVIEW_ENABLED ?? "").trim().toLowerCase() === "true"
  );
}

/**
 * A clearly-labelled sample recipient used when no real contact is selected, so
 * an operator can preview merge-field resolution without picking a prospect.
 */
const SAMPLE_CONTACT: SequenceCompositionContact = {
  firstName: "Sam",
  lastName: "Sample",
  fullName: "Sam Sample",
  company: "Sample Company Ltd",
  role: "Operations Manager",
  website: null,
  email: "sam.sample@example.com",
  mobilePhone: null,
  officePhone: null,
};

export type OutreachEmailPreview = RenderedOutreachEmail & {
  sequenceName: string;
  category: ClientEmailTemplateCategory;
  contactLabel: string;
  mailboxLabel: string;
  /** True when a real selected contact supplied the merge data. */
  usedRealContact: boolean;
};

export type OutreachEmailPreviewResult =
  | { ok: true; preview: OutreachEmailPreview }
  | { ok: false; error: string };

export async function loadOutreachEmailPreview(input: {
  staff: StaffUser;
  clientId: string;
  sequenceId: string;
  category: ClientEmailTemplateCategory;
  /** Optional real contact to resolve merge fields against. */
  contactId?: string | null;
}): Promise<OutreachEmailPreviewResult> {
  if (!isPreSendPreviewEnabled()) {
    return { ok: false, error: "Pre-send preview is not enabled." };
  }
  await requireClientAccess(input.staff, input.clientId);

  const sequence = await prisma.clientEmailSequence.findFirst({
    where: { id: input.sequenceId, clientId: input.clientId },
    select: {
      id: true,
      name: true,
      steps: {
        where: { category: input.category },
        select: {
          template: { select: { subject: true, content: true } },
        },
      },
    },
  });
  if (!sequence) {
    return { ok: false, error: "Sequence not found for this client." };
  }
  const template = sequence.steps[0]?.template;
  if (!template) {
    return {
      ok: false,
      error: `This sequence has no ${input.category} step/template to preview.`,
    };
  }

  const [client, identities] = await Promise.all([
    prisma.client.findUniqueOrThrow({
      where: { id: input.clientId },
      select: {
        id: true,
        name: true,
        defaultSenderEmail: true,
        onboarding: { select: { formData: true } },
      },
    }),
    prisma.clientMailboxIdentity.findMany({ where: { clientId: input.clientId } }),
  ]);

  const pool = eligibleWorkspaceMailboxPool(identities);
  if (pool.length === 0) {
    return {
      ok: false,
      error:
        "No connected sending mailbox in this workspace — connect a mailbox to preview the real signature.",
    };
  }
  const mailbox =
    pool.find((m) => isEffectivePrimaryMailbox(m)) ?? pool[0];

  // Optional real contact (tenant-scoped); else a labelled sample.
  let contact: SequenceCompositionContact = SAMPLE_CONTACT;
  let contactLabel = "Sample contact (Sam Sample · Sample Company Ltd)";
  let usedRealContact = false;
  if (input.contactId) {
    const real = await prisma.contact.findFirst({
      where: { id: input.contactId, clientId: input.clientId },
      select: {
        firstName: true,
        lastName: true,
        fullName: true,
        company: true,
        title: true,
        email: true,
        mobilePhone: true,
        officePhone: true,
      },
    });
    if (real) {
      contact = {
        firstName: real.firstName,
        lastName: real.lastName,
        fullName: real.fullName,
        company: real.company,
        role: real.title,
        website: null,
        email: real.email,
        mobilePhone: real.mobilePhone,
        officePhone: real.officePhone,
      };
      contactLabel = real.email ?? real.fullName ?? "Selected contact";
      usedRealContact = true;
    }
  }

  // Same unsubscribe URL shape the send path uses: hosted token URL when a
  // public base URL is configured, else the mailto placeholder. A sample token
  // is fine — this is a preview, not a live send.
  const publicBaseUrl = resolvePublicBaseUrl();
  const hostedUnsubscribeUrl = publicBaseUrl
    ? `${publicBaseUrl}/unsubscribe/PREVIEW-SAMPLE-TOKEN`
    : null;
  const unsubscribeUrl =
    hostedUnsubscribeUrl ??
    (client.defaultSenderEmail
      ? `mailto:${client.defaultSenderEmail}?subject=unsubscribe`
      : "");

  const brief = getClientSenderProfile({
    client: { name: client.name },
    formData: client.onboarding?.formData ?? null,
  });
  const sender = buildSenderRow(client, brief, unsubscribeUrl, {
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

  const rendered = renderOutreachEmail({
    subject: template.subject,
    content: template.content,
    contact,
    sender,
    mailbox: {
      provider: mailbox.provider,
      email: mailbox.email,
      displayName: mailbox.displayName,
      senderDisplayName: mailbox.senderDisplayName,
      senderSignatureHtml: mailbox.senderSignatureHtml,
      senderSignatureText: mailbox.senderSignatureText,
      senderSignatureSource: mailbox.senderSignatureSource,
      senderSignatureSyncedAt: mailbox.senderSignatureSyncedAt,
      senderSignatureSyncError: mailbox.senderSignatureSyncError,
    },
    unsubscribeUrl,
    hostedUnsubscribeUrl,
  });

  return {
    ok: true,
    preview: {
      ...rendered,
      sequenceName: sequence.name,
      category: input.category,
      contactLabel,
      mailboxLabel: mailbox.email,
      usedRealContact,
    },
  };
}
