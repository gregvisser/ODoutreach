"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { importContactsCsvAction } from "@/app/(app)/contacts/actions";
import { previewContactsCsvAction } from "@/app/(app)/contacts/preview-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ImportPreviewResult } from "@/lib/contacts/import-preview";

export type ClientListOption = {
  id: string;
  name: string;
  memberCount: number;
};

type Props = {
  clients: { id: string; name: string }[];
  listsByClientId?: Record<string, ClientListOption[]>;
};

type PreviewState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      result: ImportPreviewResult;
      resolvedListLabel: string;
      fileName: string;
    };

/**
 * PR G — CSV import form with an explicit preview / confirm flow.
 *
 * Two-step UX:
 *   1. Operator picks client, list target, and CSV file. Clicking "Preview"
 *      sends the file text to `previewContactsCsvAction`, which classifies
 *      every row (create / update / attachOnly / skipped) and returns
 *      counts. Nothing is written.
 *   2. After a clean preview, the operator clicks "Confirm import", which
 *      submits the same `<form>` with the same File to
 *      `importContactsCsvAction`. The server re-parses the file and writes
 *      using the existing importer — we never trust the client-held preview
 *      result as the source of truth for the write.
 */
export function CsvImportForm({ clients, listsByClientId = {} }: Props) {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [existingListId, setExistingListId] = useState<string>("");
  const [newListName, setNewListName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);

  const lists = useMemo(
    () => listsByClientId[selectedClientId] ?? [],
    [listsByClientId, selectedClientId],
  );

  const hasListTarget =
    existingListId.trim().length > 0 || newListName.trim().length > 0;
  const canPreview =
    Boolean(selectedClientId) && hasListTarget && file !== null && !pending;
  const confirmEnabled =
    preview.kind === "ready" &&
    preview.result.summary.totalRows > 0 &&
    (preview.result.summary.createRows + preview.result.summary.attachRows) > 0;

  function resetPreview() {
    setPreview({ kind: "idle" });
  }

  async function runPreview() {
    if (!file) return;
    const text = await file.text();
    startTransition(async () => {
      const result = await previewContactsCsvAction({
        clientId: selectedClientId,
        existingListId: existingListId || null,
        newListName: newListName || null,
        fileName: file.name,
        csvText: text,
      });
      if (result.ok) {
        setPreview({
          kind: "ready",
          result: result.preview,
          resolvedListLabel: result.resolvedListLabel,
          fileName: result.fileName,
        });
      } else {
        setPreview({ kind: "error", message: result.error });
      }
    });
  }

  return (
    <Card className="border-dashed border-primary/30 bg-primary/5 shadow-sm">
      <CardHeader>
        <CardTitle>CSV import</CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">
            Preview does not create contacts.
          </span>{" "}
          Pick a client, list target, and CSV file, then press{" "}
          <span className="font-medium">Preview</span> to see exactly what will
          happen. Press <span className="font-medium">Confirm import</span> only
          when the preview looks right —{" "}
          <span className="font-medium">
            Confirm import writes contacts and attaches them to the selected
            list.
          </span>{" "}
          Contacts without an email can still be valid, but they are not
          email-sendable and are skipped by this importer today. Accepted
          headings (fields may be empty):{" "}
          <span className="font-mono text-foreground">
            Name, Employer, Title, First Name, Last Name, Location, City,
            Country, LinkedIn, Job1 Title, A Emails, Mobile Phone Number,
            Office Number
          </span>
          . Legacy aliases (email, full_name, first_name, last_name, company,
          title, domain, source) remain supported.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          action={importContactsCsvAction}
          className="space-y-4"
        >
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="clientId">Client workspace</Label>
            <select
              id="clientId"
              name="clientId"
              required
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setExistingListId("");
                resetPreview();
              }}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="existingListId">Use existing list (optional)</Label>
            <select
              id="existingListId"
              name="existingListId"
              value={existingListId}
              onChange={(e) => {
                setExistingListId(e.target.value);
                if (e.target.value) setNewListName("");
                resetPreview();
              }}
              disabled={!selectedClientId || lists.length === 0}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {selectedClientId && lists.length === 0
                  ? "No existing lists for this client — type a new name below"
                  : "None (create a new list)"}
              </option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.memberCount})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="newListName">
              Or create a new list{" "}
              <span className="text-xs text-muted-foreground">
                (required if no existing list selected)
              </span>
            </Label>
            <Input
              id="newListName"
              name="newListName"
              type="text"
              placeholder="e.g. Manchester Finance Directors — April 2026"
              value={newListName}
              onChange={(e) => {
                setNewListName(e.target.value);
                if (e.target.value) setExistingListId("");
                resetPreview();
              }}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="file">CSV file</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                resetPreview();
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!canPreview}
              onClick={runPreview}
              variant={preview.kind === "ready" ? "outline" : "default"}
            >
              {pending ? "Previewing…" : "Preview"}
            </Button>
            <Button
              type="submit"
              name="confirm"
              value="yes"
              disabled={!confirmEnabled || pending}
            >
              Confirm import
            </Button>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accessible workspaces — ask an admin to grant membership or
                use an ADMIN account.
              </p>
            ) : null}
          </div>

          {!hasListTarget ? (
            <p className="text-xs text-muted-foreground">
              Pick an existing list or type a new list name to enable preview.
            </p>
          ) : null}
          {!file && hasListTarget ? (
            <p className="text-xs text-muted-foreground">
              Choose a CSV file to enable preview.
            </p>
          ) : null}

          {preview.kind === "error" ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Preview failed: {preview.message}
            </p>
          ) : null}

          {preview.kind === "ready" ? (
            <PreviewPanel
              preview={preview.result}
              listLabel={preview.resolvedListLabel}
              fileName={preview.fileName}
            />
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function PreviewPanel({
  preview,
  listLabel,
  fileName,
}: {
  preview: ImportPreviewResult;
  listLabel: string;
  fileName: string;
}) {
  const s = preview.summary;
  const tiles: { label: string; value: number; tone?: "ok" | "warn" | "muted" }[] = [
    { label: "Total rows", value: s.totalRows, tone: "muted" },
    { label: "Mapped rows", value: s.mappedRows, tone: "muted" },
    { label: "Valid rows", value: s.validRows, tone: "muted" },
    { label: "Email-sendable", value: s.emailSendableRows, tone: "ok" },
    { label: "Valid, no email", value: s.validNoEmailRows, tone: "warn" },
    { label: "Missing identifier", value: s.missingIdentifierRows, tone: "warn" },
    { label: "Suppressed", value: s.suppressedRows, tone: "warn" },
    { label: "Duplicates", value: s.duplicateRows, tone: "muted" },
    { label: "Will create", value: s.createRows, tone: "ok" },
    { label: "Will attach only", value: s.attachRows, tone: "muted" },
    { label: "Will skip", value: s.skippedRows, tone: "warn" },
  ];

  return (
    <div className="space-y-3 rounded-md border border-border/80 bg-background px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            Preview —{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {fileName}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Target list:{" "}
            <span className="font-medium text-foreground">{listLabel}</span>.
            Confirm import writes contacts and attaches them to this list.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={
              "rounded-md border border-border/70 px-3 py-2 text-sm " +
              (t.tone === "ok"
                ? "bg-primary/5"
                : t.tone === "warn"
                  ? "bg-amber-500/5"
                  : "bg-muted/40")
            }
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t.label}
            </p>
            <p className="text-lg font-semibold tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>

      {preview.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rows detected in this file.
        </p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-md border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.rowNumber}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.displayName || (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.company || "—"}
                  </TableCell>
                  <TableCell>
                    {row.email ?? (
                      <span
                        className="text-xs text-muted-foreground"
                        title="No valid email on this row."
                      >
                        No email
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PreviewStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <PreviewReadinessBadge readiness={row.readiness} />
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">
                    {row.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Contacts without email can be valid, but are not email-sendable. Rows
        marked <em>skipped</em> will not be written; attach-only rows add an
        existing contact to this list without mutating the contact.
      </p>
    </div>
  );
}

function PreviewStatusBadge({
  status,
}: {
  status: ImportPreviewResult["rows"][number]["status"];
}) {
  switch (status) {
    case "create":
      return <Badge variant="default">Create</Badge>;
    case "update":
      return <Badge variant="secondary">Update</Badge>;
    case "attachOnly":
      return <Badge variant="secondary">Attach only</Badge>;
    case "skipped":
    default:
      return <Badge variant="outline">Skipped</Badge>;
  }
}

function PreviewReadinessBadge({
  readiness,
}: {
  readiness: ImportPreviewResult["rows"][number]["readiness"];
}) {
  switch (readiness) {
    case "email_sendable":
      return <Badge variant="default">Email-sendable</Badge>;
    case "valid_no_email":
      return <Badge variant="secondary">Valid, no email</Badge>;
    case "suppressed":
      return <Badge variant="destructive">Suppressed</Badge>;
    case "missing_identifier":
    default:
      return <Badge variant="outline">Missing identifier</Badge>;
  }
}
