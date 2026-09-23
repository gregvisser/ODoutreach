/**
 * Read-only mailbox signature diagnostics for the support agent and staff tools.
 * No I/O, no secrets — safe to unit test.
 */

import {
  ownDomainsFor,
  registrableDomainOf,
  signatureLinkStatusFor,
} from "@/lib/clients/signature-link-alignment";
import { getOperatorSignatureState } from "@/lib/mailboxes/signature-operator-state";
import type { OperatorMailboxRow } from "@/lib/mailboxes/mailboxes-operator-model";
import {
  buildSenderSignatureViewModel,
  chooseSignatureForSend,
  htmlSignatureToText,
  normaliseSignatureHtml,
  type SenderSignatureMailbox,
} from "@/lib/mailboxes/sender-signature";

export type SignatureImageSourceSummary = {
  scheme: string;
  host: string | null;
  count: number;
  /** True for cid: or data: URLs that usually break in outbound HTML. */
  likelyBrokenInOutbound: boolean;
};

export type MailboxSignatureInspectionInput = {
  client: {
    id: string;
    slug: string;
    name: string;
    website: string | null;
    logoUrl: string | null;
    signaturePhone: string | null;
  };
  mailbox: SenderSignatureMailbox &
    Pick<
      OperatorMailboxRow,
      "id" | "email" | "connectionStatus" | "provider" | "displayName"
    > & {
      senderPhone: string | null;
      isSendingEnabled: boolean;
      lastError: string | null;
    };
  allMailboxEmails: readonly string[];
};

export type MailboxSignatureInspection = {
  client: { id: string; slug: string; name: string };
  mailbox: {
    id: string;
    email: string;
    provider: "MICROSOFT" | "GOOGLE";
    connectionStatus: OperatorMailboxRow["connectionStatus"];
    isSendingEnabled: boolean;
    lastError: string | null;
  };
  signature: {
    source: string | null;
    lastSyncedAt: string | null;
    syncError: string | null;
    htmlLength: number;
    textLength: number;
    hasHtml: boolean;
    hasText: boolean;
    imageSources: SignatureImageSourceSummary[];
    linkStatus: ReturnType<typeof signatureLinkStatusFor>;
    operatorState: ReturnType<typeof getOperatorSignatureState>;
    sendSelectionSource: string;
    plainTextPreview: string;
  };
  proposedFixes: string[];
};

function summarizeImageSources(html: string | null): SignatureImageSourceSummary[] {
  if (!html?.trim()) return [];
  const srcRe = /\bsrc\s*=\s*["']([^"']+)["']/gi;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(html)) !== null) {
    urls.push(m[1]!.trim());
  }
  const buckets = new Map<string, SignatureImageSourceSummary>();

  for (const link of urls) {
    const raw = link.trim();
    let scheme = "unknown";
    let host: string | null = null;
    let likelyBroken = false;
    if (/^cid:/i.test(raw)) {
      scheme = "cid";
      host = null;
      likelyBroken = true;
    } else if (/^data:/i.test(raw)) {
      scheme = "data";
      host = null;
      likelyBroken = true;
    } else {
      try {
        const u = new URL(raw);
        scheme = u.protocol.replace(/:$/, "");
        host = u.hostname || null;
      } catch {
        scheme = "relative-or-invalid";
        likelyBroken = true;
      }
    }
    const key = `${scheme}|${host ?? ""}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, {
        scheme,
        host,
        count: 1,
        likelyBrokenInOutbound: likelyBroken,
      });
    }
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}

function buildProposedFixes(
  input: MailboxSignatureInspectionInput,
  inspection: Omit<MailboxSignatureInspection, "proposedFixes">,
): string[] {
  const fixes: string[] = [];
  const { mailbox, signature } = inspection;
  const operatorState = signature.operatorState;

  if (mailbox.connectionStatus !== "CONNECTED") {
    fixes.push(
      "Reconnect the mailbox from Mailboxes (Connect), then re-check the signature.",
    );
    return fixes;
  }

  if (signature.syncError) {
    fixes.push(
      mailbox.provider === "GOOGLE"
        ? "In Mailboxes, use Sync from Gmail on this row, then Preview signature. If sync still fails, paste the full HTML signature manually (hosted logo URL, not an attachment reference)."
        : "Paste the full HTML signature in Mailboxes (Microsoft does not allow automatic pull). Use a logo URL on the client's own domain or CDN.",
    );
  }

  if (operatorState.kind === "missing" || operatorState.kind === "minimal_signature") {
    fixes.push(
      "Use Set signature or Insert OpensDoors branded template on this mailbox, then Preview signature before asking the client to send again.",
    );
  }

  const brokenImages = signature.imageSources.filter((s) => s.likelyBrokenInOutbound);
  if (brokenImages.length > 0) {
    fixes.push(
      "Replace inline/attached images (cid: or pasted data: URLs) with a public https:// logo URL — e.g. the client website or logo field — then save and preview again.",
    );
  } else if (
    signature.imageSources.length > 0 &&
    signature.linkStatus.tone === "warning"
  ) {
    fixes.push(
      "Confirm the logo host in the signature is deliberate (usually a CDN). If the image fails to load for recipients, re-host it on the client's domain and update the signature HTML.",
    );
  }

  if (signature.linkStatus.tone === "blocked") {
    fixes.push(
      "Remove or replace links to the OpensDoors app domain in the signature HTML — sending stays blocked until those hosts are gone.",
    );
  }

  if (
    signature.hasText &&
    !signature.hasHtml &&
    signature.imageSources.length === 0 &&
    input.client.logoUrl
  ) {
    fixes.push(
      "Only plain text is stored — images will not appear. Paste HTML that includes an <img src=\"https://…\"> logo or use the branded template with the client logo URL.",
    );
  }

  if (fixes.length === 0 && operatorState.sendReadyFromSignature) {
    fixes.push(
      "Signature storage looks healthy. If the image still missing in live mail, compare Preview signature with a test send and check the recipient client is not blocking remote images.",
    );
  }

  return [...new Set(fixes)];
}

export function inspectMailboxSignature(
  input: MailboxSignatureInspectionInput,
): MailboxSignatureInspection {
  const vm = buildSenderSignatureViewModel(input.mailbox, {
    senderDisplayNameFallback: null,
    emailSignatureFallback: null,
  });
  const selection = chooseSignatureForSend({
    mailbox: input.mailbox,
    clientBrief: { senderDisplayNameFallback: null, emailSignatureFallback: null },
  });
  const operatorRow: Pick<
    OperatorMailboxRow,
    "connectionStatus" | "provider" | "email" | "id"
  > = {
    id: input.mailbox.id,
    email: input.mailbox.email,
    provider: input.mailbox.provider,
    connectionStatus: input.mailbox.connectionStatus,
  };
  const operatorState = getOperatorSignatureState(
    operatorRow,
    vm,
    selection,
    input.mailbox,
  );

  const normHtml = normaliseSignatureHtml(input.mailbox.senderSignatureHtml);
  const text =
    input.mailbox.senderSignatureText?.trim() ??
    (normHtml.length > 0 ? htmlSignatureToText(normHtml) : "");
  const imageSources = summarizeImageSources(input.mailbox.senderSignatureHtml);
  const ownDomains = ownDomainsFor({
    mailboxEmails: input.allMailboxEmails,
    website: input.client.website,
  });
  const linkStatus = signatureLinkStatusFor({
    email: input.mailbox.email,
    senderSignatureHtml: input.mailbox.senderSignatureHtml,
    senderSignatureText: input.mailbox.senderSignatureText,
    ownDomains,
  });

  const plainTextPreview =
    text.length > 320 ? `${text.slice(0, 320)}…` : text;

  const base: Omit<MailboxSignatureInspection, "proposedFixes"> = {
    client: {
      id: input.client.id,
      slug: input.client.slug,
      name: input.client.name,
    },
    mailbox: {
      id: input.mailbox.id,
      email: input.mailbox.email,
      provider: input.mailbox.provider,
      connectionStatus: input.mailbox.connectionStatus,
      isSendingEnabled: input.mailbox.isSendingEnabled,
      lastError: input.mailbox.lastError,
    },
    signature: {
      source: input.mailbox.senderSignatureSource,
      lastSyncedAt: vm.lastSyncedAtIso,
      syncError: vm.syncError,
      htmlLength: normHtml.length,
      textLength: text.length,
      hasHtml: normHtml.length > 0,
      hasText: text.length > 0,
      imageSources,
      linkStatus,
      operatorState: {
        kind: operatorState.kind,
        label: operatorState.label,
        shortDescription: operatorState.shortDescription,
        recommendedAction: operatorState.recommendedAction,
        sendReadyFromSignature: operatorState.sendReadyFromSignature,
      },
      sendSelectionSource: selection.source,
      plainTextPreview,
    },
  };

  return {
    ...base,
    proposedFixes: buildProposedFixes(input, base),
  };
}

export type MailboxListSummary = {
  client: { id: string; slug: string; name: string };
  mailboxes: Array<{
    id: string;
    email: string;
    provider: "MICROSOFT" | "GOOGLE";
    connectionStatus: OperatorMailboxRow["connectionStatus"];
    signatureSource: string | null;
    hasSignatureHtml: boolean;
    hasSignatureText: boolean;
  }>;
};

export function summarizeClientMailboxesForSupport(
  client: MailboxListSummary["client"],
  mailboxes: Array<
    Pick<
      SenderSignatureMailbox,
      "senderSignatureHtml" | "senderSignatureText" | "senderSignatureSource"
    > &
      Pick<OperatorMailboxRow, "id" | "email" | "provider" | "connectionStatus">
  >,
): MailboxListSummary {
  return {
    client,
    mailboxes: mailboxes.map((m) => ({
      id: m.id,
      email: m.email,
      provider: m.provider,
      connectionStatus: m.connectionStatus,
      signatureSource: m.senderSignatureSource,
      hasSignatureHtml: !!m.senderSignatureHtml?.trim(),
      hasSignatureText: !!m.senderSignatureText?.trim(),
    })),
  };
}

export function sendingDomainFromEmail(email: string): string | null {
  return registrableDomainOf(email.split("@").pop());
}
