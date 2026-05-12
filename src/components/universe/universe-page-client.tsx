"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createListFromUniverseAction } from "@/app/(app)/universe/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { UniverseTableRow } from "@/server/queries/contact-universe-list";

type ClientOption = { id: string; name: string };

type Props = {
  rows: UniverseTableRow[];
  total: number;
  page: number;
  pageSize: number;
  clients: ClientOption[];
  /** Current filter values (from URL). */
  filters: {
    q: string;
    hasEmail: string;
    company: string;
    jobTitle: string;
    country: string;
    city: string;
    sourceType: string;
    sort: string;
  };
};

function rowDisplayName(r: UniverseTableRow): string {
  const full = r.fullName?.trim();
  if (full) return full;
  const joined = [r.firstName, r.lastName].filter((s) => (s ?? "").trim()).join(" ");
  return joined || "—";
}

export function UniversePageClient({
  rows,
  total,
  page,
  pageSize,
  clients,
  filters,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listName, setListName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const allPageSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const r of rows) next.delete(r.id);
      } else {
        for (const r of rows) next.add(r.id);
      }
      return next;
    });
  }

  function applyFilters(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    const fields = [
      "q",
      "hasEmail",
      "company",
      "jobTitle",
      "country",
      "city",
      "sourceType",
      "sort",
    ] as const;
    for (const f of fields) {
      const v = String(fd.get(f) ?? "").trim();
      if (v) q.set(f, v);
    }
    q.set("page", "1");
    startTransition(() => {
      router.push(`/universe?${q.toString()}`);
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Filter contacts, select the ones you need, then create a client list.
      </p>

      <form
        onSubmit={applyFilters}
        className="rounded-lg border border-border/80 bg-card p-4 shadow-sm space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              defaultValue={filters.q}
              placeholder="Name, email, employer, title, city, or country"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hasEmail">Email</Label>
            <select
              id="hasEmail"
              name="hasEmail"
              defaultValue={filters.hasEmail}
              disabled={pending}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Any</option>
              <option value="yes">Has email</option>
              <option value="no">No email</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sourceType">Source</Label>
            <select
              id="sourceType"
              name="sourceType"
              defaultValue={filters.sourceType}
              disabled={pending}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="ALL">All</option>
              <option value="CSV_IMPORT">CSV</option>
              <option value="ROCKETREACH">RocketReach</option>
              <option value="MANUAL">Manual</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Employer contains</Label>
            <Input id="company" name="company" defaultValue={filters.company} disabled={pending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Job1 Title contains</Label>
            <Input id="jobTitle" name="jobTitle" defaultValue={filters.jobTitle} disabled={pending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country contains</Label>
            <Input id="country" name="country" defaultValue={filters.country} disabled={pending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City contains</Label>
            <Input id="city" name="city" defaultValue={filters.city} disabled={pending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sort">Sort</Label>
            <select
              id="sort"
              name="sort"
              defaultValue={filters.sort || "lastSeen"}
              disabled={pending}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="lastSeen">Last seen</option>
              <option value="company">Employer</option>
              <option value="email">A Emails</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Apply filters
          </Button>
          <Link
            href="/universe"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="rounded-lg border border-border/80 bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-medium">Create list from selected contacts</h2>
            <p className="text-xs text-muted-foreground">
              Adds workspace contacts to the list you name. Contacts stay in Universe for reuse.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.size} selected · {total.toLocaleString()} contacts
          </p>
        </div>
        {actionMessage ? (
          <p className="text-sm rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            {actionMessage}
          </p>
        ) : null}
        <form
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"
          action={async (fd) => {
            setActionMessage(null);
            const res = await createListFromUniverseAction(fd);
            if (!res.ok) {
              setActionMessage(res.error);
              return;
            }
            const r = res.result;
            setActionMessage(
              `Created list “${r.listName}” with ${String(r.addedToList)} contacts (${String(r.materializedNewContacts)} new in this workspace, ${String(r.reusedExistingContacts)} already there). Rows skipped in the list: ${String(r.listSkippedDuplicates)}; skipped with no email: ${String(r.skippedNoEmail)}.`,
            );
            setSelected(new Set());
          }}
        >
          <input type="hidden" name="universeContactIds" value={[...selected].join(",")} />
          <div className="space-y-1.5">
            <Label>Client workspace</Label>
            <Select
              value={clientId}
              onValueChange={(v) => setClientId(v ?? "")}
              disabled={clients.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="clientId" value={clientId} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="listName">List name</Label>
            <Input
              id="listName"
              name="listName"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="e.g. Manchester FDs — May 2026"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={selected.size === 0 || !clientId || pending}>
              Create list
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-border/80 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allPageSelected && someSelected;
                  }}
                  onChange={togglePage}
                  aria-label="Select all on this page"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Employer</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>First Name</TableHead>
              <TableHead>Last Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Linkedin</TableHead>
              <TableHead>Job1 Title</TableHead>
              <TableHead>A Emails</TableHead>
              <TableHead>Mobile Number</TableHead>
              <TableHead>Office Number</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="text-right">Refs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleRow(r.id)}
                    aria-label={`Select ${rowDisplayName(r)}`}
                  />
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-sm font-medium">
                  {rowDisplayName(r)}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-xs">{r.companyName ?? "—"}</TableCell>
                <TableCell className="max-w-[100px] truncate text-xs">{r.industry ?? "—"}</TableCell>
                <TableCell className="max-w-[90px] truncate text-xs">{r.firstName ?? "—"}</TableCell>
                <TableCell className="max-w-[90px] truncate text-xs">{r.lastName ?? "—"}</TableCell>
                <TableCell className="max-w-[90px] truncate text-xs">{r.city ?? "—"}</TableCell>
                <TableCell className="max-w-[90px] truncate text-xs">{r.country ?? "—"}</TableCell>
                <TableCell className="max-w-[100px] truncate text-xs">
                  {r.linkedinUrlNormalized ? (
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href={
                        r.linkedinUrlNormalized.startsWith("http")
                          ? r.linkedinUrlNormalized
                          : `https://${r.linkedinUrlNormalized}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Profile
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-xs">{r.jobTitle ?? "—"}</TableCell>
                <TableCell className="max-w-[140px] truncate font-mono text-xs">
                  {r.emailNormalized ?? "—"}
                </TableCell>
                <TableCell className="max-w-[100px] truncate text-xs">
                  {r.mobilePhoneNormalized ?? "—"}
                </TableCell>
                <TableCell className="max-w-[100px] truncate text-xs">
                  {r.officePhoneNormalized ?? "—"}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-xs">
                  {r.sourceSummary ?? r.firstSeenSourceType}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {r.lastSeenAt.toISOString().slice(0, 16).replace("T", " ")}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {r.clientContactCount} in lists · {r.sourceCount} touches
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No contacts match these filters yet. If you expected rows here, confirm a recent import ran for
            this environment — older workspace contacts are not auto-copied into Universe. Import from a
            client workspace{" "}
            <Link href="/clients" className="font-medium text-primary underline-offset-2 hover:underline">
              Sources
            </Link>{" "}
            tab, or use the main Contacts page.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => {
              const p = new URLSearchParams(sp.toString());
              p.set("page", String(page - 1));
              router.push(`/universe?${p.toString()}`);
            }}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || pending}
            onClick={() => {
              const p = new URLSearchParams(sp.toString());
              p.set("page", String(page + 1));
              router.push(`/universe?${p.toString()}`);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
