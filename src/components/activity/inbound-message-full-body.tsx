"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { fetchInboundMessageFullBodyAction } from "@/app/(app)/clients/[clientId]/activity/messages/[messageId]/reply-actions";
import { Button } from "@/components/ui/button";
import type { InboundFullBodyErrorCategory } from "@/lib/inbox/inbound-full-body-errors";

type Props = {
  clientId: string;
  inboundMessageId: string;
  bodyText: string | null;
  bodyContentType: string | null;
  fullBodySize: number | null;
  fullBodySource: string | null;
  fullBodyFetchedAt: string | null;
  bodyPreview: string | null;
  snippet: string | null;
  mailboxEmail: string;
  provider: string;
};

function formatFetchedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return `${new Date(iso).toISOString().replace("T", " ").slice(0, 16)} UTC`;
  } catch {
    return "—";
  }
}

function humanizeSource(source: string | null): string {
  if (source === "MICROSOFT_GRAPH") return "Microsoft Graph";
  if (source === "GMAIL_API") return "Gmail API";
  if (!source) return "—";
  return source;
}

function humanizeBytes(size: number | null): string {
  if (size == null) return "—";
  if (size < 1024) return `${size} chars`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * PR P — Presentational + on-demand fetch client component for the
 * inbound message detail page.
 *
 * Renders the cached `bodyText` as plain pre-wrap text (never raw HTML).
 * When only a preview is available, shows a "Fetch full email body"
 * button that calls the server action to pull + cache the body.
 */
export function InboundMessageFullBody(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<
    | { tone: "ok"; text: string }
    | {
        tone: "err";
        title: string;
        text: string;
        category: InboundFullBodyErrorCategory | "unclassified";
        retryable: boolean;
      }
    | null
  >(null);

  // Local copy so the UI can show the fresh body immediately after fetch
  // without waiting on router.refresh() to complete rendering.
  const [liveBody, setLiveBody] = useState<{
    bodyText: string;
    bodyContentType: string;
    fullBodySize: number;
    fullBodySource: string;
    fullBodyFetchedAt: string;
  } | null>(null);

  const bodyText = liveBody?.bodyText ?? props.bodyText ?? null;
  const bodyContentType =
    liveBody?.bodyContentType ?? props.bodyContentType ?? null;
  const fullBodySize = liveBody?.fullBodySize ?? props.fullBodySize ?? null;
  const fullBodySource =
    liveBody?.fullBodySource ?? props.fullBodySource ?? null;
  const fullBodyFetchedAt =
    liveBody?.fullBodyFetchedAt ?? props.fullBodyFetchedAt ?? null;
  const hasFullBody = !!bodyText && bodyText.trim().length > 0;

  const previewText =
    (props.bodyPreview && props.bodyPreview.trim().length > 0
      ? props.bodyPreview
      : null) ??
    (props.snippet && props.snippet.trim().length > 0 ? props.snippet : null);

  const onFetch = () => {
    setBanner(null);
    startTransition(async () => {
      const result = await fetchInboundMessageFullBodyAction({
        clientId: props.clientId,
        inboundMessageId: props.inboundMessageId,
      });
      if (result.ok) {
        setLiveBody({
          bodyText: result.bodyText,
          bodyContentType: result.bodyContentType,
          fullBodySize: result.fullBodySize,
          fullBodySource: result.fullBodySource,
          fullBodyFetchedAt: result.fullBodyFetchedAt,
        });
        setBanner({
          tone: "ok",
          text: `Fetched full body from ${humanizeSource(result.fullBodySource)}.`,
        });
        router.refresh();
      } else {
        setBanner({
          tone: "err",
          title: result.title ?? "Full body fetch failed",
          text: result.error,
          category: result.category ?? "unclassified",
          retryable: result.retryable ?? true,
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      {hasFullBody ? (
        <>
          <div className="rounded-md border border-border/70 bg-background px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Full body
            </p>
            <pre className="mt-2 max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-foreground">
              {bodyText}
            </pre>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[max-content_1fr]">
            <dt>Fetched at</dt>
            <dd>{formatFetchedAt(fullBodyFetchedAt)}</dd>
            <dt>Provider</dt>
            <dd>{humanizeSource(fullBodySource)}</dd>
            <dt>Mailbox</dt>
            <dd className="break-all">
              {props.mailboxEmail} ({props.provider})
            </dd>
            <dt>Body source</dt>
            <dd>{bodyContentType ?? "—"}</dd>
            <dt>Size</dt>
            <dd>{humanizeBytes(fullBodySize)}</dd>
          </dl>
          <p className="text-[11px] text-muted-foreground">
            Full body is fetched from the connected mailbox and stored in
            ODoutreach for this workspace.
          </p>
        </>
      ) : (
        <>
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            {previewText ? (
              <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-foreground">
                {previewText}
              </pre>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground italic">
                No preview available for this message.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={onFetch}
              disabled={pending || fetchButtonHardDisabled(banner)}
            >
              {pending ? "Fetching full body…" : "Fetch full email body"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Full body is fetched from the connected mailbox and stored in
              ODoutreach for this workspace.
            </span>
          </div>
        </>
      )}

      {banner ? (
        banner.tone === "ok" ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {banner.text}
          </p>
        ) : (
          <div
            className={
              banner.category === "message_not_available"
                ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                : "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            }
          >
            <p className="font-medium">{banner.title}</p>
            <p className="mt-1">{banner.text}</p>
            {banner.category === "message_not_available" ? (
              <p className="mt-1 text-xs">
                ODoutreach still has the preview captured at ingestion above.
                This can happen if the email was moved to another folder or
                deleted in Outlook/Gmail after it was ingested.
              </p>
            ) : null}
            {!banner.retryable ? (
              <p className="mt-1 text-xs">
                Retrying will keep returning the same result until the
                underlying cause is fixed.
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * PR Q — keep the Fetch button visible but disable it after a
 * non-retryable classified failure (e.g. message_not_available) so
 * operators don't spam the provider with identical requests.
 */
function fetchButtonHardDisabled(
  banner:
    | { tone: "ok"; text: string }
    | {
        tone: "err";
        title: string;
        text: string;
        category: InboundFullBodyErrorCategory | "unclassified";
        retryable: boolean;
      }
    | null,
): boolean {
  if (!banner) return false;
  if (banner.tone === "ok") return false;
  return !banner.retryable;
}
