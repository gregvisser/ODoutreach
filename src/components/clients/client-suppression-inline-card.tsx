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

type SourceRow = {
  id: string;
  kind: "EMAIL" | "DOMAIN";
  spreadsheetId: string | null;
  sheetRange: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

type Props = {
  clientId: string;
  clientName: string;
  sources: SourceRow[];
  googleServiceAccountConfigured: boolean;
  /** Public service account email — safe to show; never a private key. */
  googleServiceAccountClientEmail: string | null;
};

export function ClientSuppressionInlineCard({
  clientId,
  clientName,
  sources,
  googleServiceAccountConfigured,
  googleServiceAccountClientEmail,
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
          `${kind === "EMAIL" ? "Email" : "Domain"} suppression Sheet saved. Share the Sheet with the service account (below) as Viewer, then click Sync.`,
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
        let text = `Sync complete — ${String(r.rowsWritten)} row(s) loaded from Google Sheets. Contact flags were refreshed.`;
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
        let text = `Sync complete — ${String(r.rowsWritten)} row(s) loaded from Google Sheets. Contact flags were refreshed.`;
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
        <CardTitle>Suppression (Google Sheets)</CardTitle>
        <CardDescription>
          Workspace: <span className="font-medium text-foreground">{clientName}</span>. Each client
          uses their own Sheet — paste the Sheet URL here. One shared{" "}
          <span className="font-medium text-foreground">Google service account</span> in Azure reads
          every Sheet after you share it; operators do not add anything in Azure per Sheet.{" "}
          <Link href={`/suppression?client=${clientId}`} className="underline underline-offset-2">
            Open suppression admin view
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {googleServiceAccountConfigured && googleServiceAccountClientEmail ? (
          <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-3 text-sm">
            <p className="font-medium text-foreground">Share suppression Sheets with</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-background px-2 py-1 text-xs">
                {googleServiceAccountClientEmail}
              </code>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  void navigator.clipboard.writeText(googleServiceAccountClientEmail);
                }}
              >
                Copy email
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              In Google Sheets: Share → add this address as <strong>Viewer</strong>. Then save the
              Sheet URL here and click Sync.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
            <p className="font-medium text-foreground">Google Sheets sync is not configured yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A one-time admin setup is required: add{" "}
              <code className="text-xs">GOOGLE_SERVICE_ACCOUNT_JSON_BASE64</code> in Azure App Service
              application settings (single service account for all clients). Operators only paste Sheet
              URLs here — no per-client Azure changes.
            </p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Email suppression</p>
            {emailSrc ? (
              <p className="font-mono text-xs text-muted-foreground break-all">
                Spreadsheet id: {emailSrc.spreadsheetId ?? "—"}
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
            <p className="text-sm font-medium">Domain suppression</p>
            {domainSrc ? (
              <p className="font-mono text-xs text-muted-foreground break-all">
                Spreadsheet id: {domainSrc.spreadsheetId ?? "—"}
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

        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Connection status</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {sources.length === 0 ? <li>No suppression sources saved yet.</li> : null}
            {sources.map((s) => (
              <li key={s.id}>
                {s.kind} · {s.syncStatus}
                {s.lastSyncedAt ? ` · last sync ${s.lastSyncedAt}` : ""}
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
