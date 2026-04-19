"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { upsertSuppressionSpreadsheetAction } from "@/app/(app)/clients/client-suppression-source-actions";
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
import { Badge } from "@/components/ui/badge";

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
};

export function ClientSuppressionInlineCard({
  clientId,
  clientName,
  sources,
  googleServiceAccountConfigured,
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
        setMsg(`${kind === "EMAIL" ? "Email" : "Domain"} suppression source updated.`);
        setEmailUrl("");
        setDomainUrl("");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Suppression (Google Sheets)</CardTitle>
        <CardDescription>
          Workspace: {clientName}. Lists are tenant-scoped. Paste a Sheet URL or raw spreadsheet id;
          sync uses the service account from{" "}
          <code className="text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code> (share the Sheet with that
          account).{" "}
          <Link href={`/suppression?client=${clientId}`} className="underline underline-offset-2">
            Open full suppression view
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
          <span className="font-medium text-foreground">Google Sheets API</span>{" "}
          {googleServiceAccountConfigured ? (
            <Badge variant="default" className="ml-2">
              Credentials present
            </Badge>
          ) : (
            <Badge variant="secondary" className="ml-2">
              Not configured — sync will fail until env is set
            </Badge>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Email suppression</p>
            {emailSrc ? (
              <p className="font-mono text-xs text-muted-foreground break-all">
                Current id: {emailSrc.spreadsheetId ?? "—"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No email source row yet — save to create.</p>
            )}
            <Label htmlFor="sup-email-url">Sheet URL or id</Label>
            <Input
              id="sup-email-url"
              value={emailUrl}
              onChange={(e) => setEmailUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || !emailUrl.trim()}
              onClick={() => save("EMAIL", emailUrl)}
            >
              Save email sheet
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Domain suppression</p>
            {domainSrc ? (
              <p className="font-mono text-xs text-muted-foreground break-all">
                Current id: {domainSrc.spreadsheetId ?? "—"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No domain source row yet — save to create.</p>
            )}
            <Label htmlFor="sup-domain-url">Sheet URL or id</Label>
            <Input
              id="sup-domain-url"
              value={domainUrl}
              onChange={(e) => setDomainUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || !domainUrl.trim()}
              onClick={() => save("DOMAIN", domainUrl)}
            >
              Save domain sheet
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Connected sources (read-only)</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {sources.length === 0 ? <li>None — use the forms above.</li> : null}
            {sources.map((s) => (
              <li key={s.id}>
                {s.kind} · {s.syncStatus}
                {s.lastSyncedAt ? ` · last sync ${s.lastSyncedAt}` : ""}
                {s.lastError ? ` · ${s.lastError}` : ""}
              </li>
            ))}
          </ul>
        </div>

        {msg ? <p className="text-sm text-foreground">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
