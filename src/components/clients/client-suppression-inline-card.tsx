"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  syncClientDomainSuppressionSourceAction,
  syncClientEmailSuppressionSourceAction,
  upsertSuppressionSpreadsheetAction,
} from "@/app/(app)/clients/client-suppression-source-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GoogleSheetsSharingCallout } from "@/components/suppression/google-sheets-sharing-callout";
import {
  suppressionKindShortLabel,
  suppressionSyncStatusLabel,
} from "@/lib/suppression/staff-labels";

type SourceRow = {
  id: string;
  kind: "EMAIL" | "DOMAIN";
  spreadsheetId: string | null;
  sheetRange: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Live count of rows currently in the do-not-contact store. */
  entryCount?: number;
};

type Props = {
  clientId: string;
  clientName: string;
  sources: SourceRow[];
  googleServiceAccountConfigured: boolean;
  /** Public service account email — safe to show; never a private key. */
  googleServiceAccountClientEmail: string | null;
  /**
   * Owner-only (isSuperAdmin). Connecting / re-pointing / syncing a sheet does
   * a delete-then-replace that can wipe blocked addresses, so the controls are
   * hidden for everyone else — they still see the read-only status below, and
   * the all-staff Quick-add manual block lives above this card.
   */
  canManageSheets: boolean;
};

export function ClientSuppressionInlineCard({
  clientId,
  clientName,
  sources,
  googleServiceAccountConfigured,
  googleServiceAccountClientEmail,
  canManageSheets,
}: Props) {
  const router = useRouter();
  const [emailUrl, setEmailUrl] = useState("");
  const [domainUrl, setDomainUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailSrc = sources.find((s) => s.kind === "EMAIL");
  const domainSrc = sources.find((s) => s.kind === "DOMAIN");

  function save(kind: "EMAIL" | "DOMAIN", urlOrId: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await upsertSuppressionSpreadsheetAction({
        clientId,
        kind,
        urlOrId,
      });
      if (r.ok) {
        setMsg(
          `${kind === "EMAIL" ? "Email" : "Domain"} do-not-contact Sheet saved. Share as Viewer, then click Sync again.`,
        );
        setEmailUrl("");
        setDomainUrl("");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function syncEmail() {
    setMsg(null);
    startTransition(async () => {
      const r = await syncClientEmailSuppressionSourceAction(clientId);
      if (r.ok) {
        let text = `Sync complete — ${String(r.rowsWritten)} do-not-contact row(s) loaded from Google Sheets. Contact flags were refreshed.`;
        if (r.warning) {
          text += ` Note: ${r.warning}`;
        }
        setMsg(text);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function syncDomain() {
    setMsg(null);
    startTransition(async () => {
      const r = await syncClientDomainSuppressionSourceAction(clientId);
      if (r.ok) {
        let text = `Sync complete — ${String(r.rowsWritten)} do-not-contact row(s) loaded from Google Sheets. Contact flags were refreshed.`;
        if (r.warning) {
          text += ` Note: ${r.warning}`;
        }
        setMsg(text);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  const canSyncEmail =
    googleServiceAccountConfigured && !!emailSrc?.spreadsheetId?.trim();
  const canSyncDomain =
    googleServiceAccountConfigured && !!domainSrc?.spreadsheetId?.trim();

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Do-not-contact lists</CardTitle>
        <CardDescription>
          Block email addresses and whole domains for{" "}
          <span className="font-medium text-foreground">{clientName}</span> that must never receive
          outreach. Each list is kept in its own
          Google Sheet and checked before sending.{" "}
          <Link href={`/suppression?client=${clientId}`} className="underline underline-offset-2">
            See the full blocked list
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canManageSheets ? (
          <>
            {googleServiceAccountConfigured && googleServiceAccountClientEmail ? (
              <details className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-foreground">
                  Share your Sheet with us
                </summary>
                <div className="mt-3">
                  <GoogleSheetsSharingCallout
                    serviceAccountEmail={googleServiceAccountClientEmail}
                    idPrefix={`client-${clientId}-suppression`}
                    copyDisabled={pending}
                  />
                </div>
              </details>
            ) : (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
                <p className="font-medium text-foreground">Google Sheets sync isn&apos;t set up yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ask an administrator to connect Google Sheets sync (a one-time
                  setup). Once it&apos;s on, you just paste a Sheet URL here.
                </p>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Email addresses never to contact</p>
                {emailSrc ? (
                  <p className="text-xs text-muted-foreground">
                    Sheet connected.
                    {emailSrc.spreadsheetId ? (
                      <>
                        {" "}
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${emailSrc.spreadsheetId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                        >
                          Open ↗
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Paste a Sheet URL and save to connect.</p>
                )}
                <Label htmlFor="sup-email-url">Sheet URL or id</Label>
                <Input
                  id="sup-email-url"
                  value={emailUrl}
                  onChange={(e) => setEmailUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !emailUrl.trim()}
                    onClick={() => save("EMAIL", emailUrl)}
                  >
                    Save email sheet
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !canSyncEmail}
                    onClick={() => syncEmail()}
                    title={
                      !googleServiceAccountConfigured
                        ? "Configure Google service account in Azure first"
                        : !emailSrc?.spreadsheetId
                          ? "Save a Sheet URL first"
                          : undefined
                    }
                  >
                    Sync email list now
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Domains never to contact</p>
                {domainSrc ? (
                  <p className="text-xs text-muted-foreground">
                    Sheet connected.
                    {domainSrc.spreadsheetId ? (
                      <>
                        {" "}
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${domainSrc.spreadsheetId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                        >
                          Open ↗
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Optional — same flow as email.</p>
                )}
                <Label htmlFor="sup-domain-url">Sheet URL or id</Label>
                <Input
                  id="sup-domain-url"
                  value={domainUrl}
                  onChange={(e) => setDomainUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !domainUrl.trim()}
                    onClick={() => save("DOMAIN", domainUrl)}
                  >
                    Save domain sheet
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !canSyncDomain}
                    onClick={() => syncDomain()}
                    title={
                      !googleServiceAccountConfigured
                        ? "Configure Google service account in Azure first"
                        : !domainSrc?.spreadsheetId
                          ? "Save a Sheet URL first"
                          : undefined
                    }
                  >
                    Sync domain list now
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Suppression sheets are connected and synced by the owner account.
            You can see the current status below. Manual blocks (the Quick-add
            form above) work for everyone and take effect on the next send.
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Connection status</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {sources.length === 0 ? (
              <li>No do-not-contact sheets connected yet.</li>
            ) : null}
            {sources.map((s) => (
              <li key={s.id}>
                {suppressionKindShortLabel(s.kind)} ·{" "}
                {suppressionSyncStatusLabel(s.syncStatus)}
                {typeof s.entryCount === "number"
                  ? ` · ${s.entryCount.toLocaleString()} ${
                      s.entryCount === 1
                        ? s.kind === "EMAIL"
                          ? "address"
                          : "domain"
                        : s.kind === "EMAIL"
                          ? "addresses"
                          : "domains"
                    } on the list`
                  : ""}
                {s.lastSyncedAt
                  ? ` · last sync ${s.lastSyncedAt.slice(0, 16).replace("T", " ")}`
                  : ""}
                {s.lastError ? ` · ${s.lastError}` : ""}
              </li>
            ))}
          </ul>
        </div>

        {msg ? <p className="whitespace-pre-wrap text-sm text-foreground">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
