"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  deleteComplianceAttachmentAction,
  saveClientBriefAction,
  uploadCompliancePdfAction,
} from "@/app/(app)/clients/client-brief-actions";
import { BriefAddressBlock } from "@/components/clients/brief-address-block";
import { BriefTaxonomyChipsField } from "@/components/clients/brief-taxonomy-chips-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { parseBriefMainContact, parseStructuredBusinessAddress } from "@/lib/brief/brief-field-helpers";
import type { OpensDoorsBriefFields } from "@/lib/opensdoors-brief";
import { cn } from "@/lib/utils";
import type { BriefTaxonomyKind } from "@/generated/prisma/enums";

type StaffOption = { id: string; email: string; displayName: string | null };

type TaxonomyState = {
  SERVICE_AREA: string[];
  TARGET_INDUSTRY: string[];
  COMPANY_SIZE: string[];
  JOB_TITLE: string[];
};

type ComplianceRow = {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type LinkRow = {
  term: { kind: BriefTaxonomyKind; displayValue: string };
};

type Props = {
  clientId: string;
  clientName: string;
  initial: OpensDoorsBriefFields;
  clientRow: {
    website: string;
    industry: string;
    briefLinkedinUrl: string;
    briefInternalNotes: string;
    briefAssignedAccountManagerId: string | null;
    briefBusinessAddress: unknown;
    briefMainContact: unknown;
  };
  taxonomyLinks: LinkRow[];
  staffOptions: StaffOption[];
  complianceFiles: ComplianceRow[];
};

function groupTaxonomy(links: LinkRow[]): TaxonomyState {
  const g: TaxonomyState = {
    SERVICE_AREA: [],
    TARGET_INDUSTRY: [],
    COMPANY_SIZE: [],
    JOB_TITLE: [],
  };
  for (const l of links) {
    g[l.term.kind].push(l.term.displayValue);
  }
  return g;
}

export function OpensDoorsBriefGuidedForm({
  clientId,
  clientName,
  initial,
  clientRow,
  taxonomyLinks,
  staffOptions,
  complianceFiles,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<OpensDoorsBriefFields>(initial);
  const [website, setWebsite] = useState(clientRow.website);
  const [industry, setIndustry] = useState(clientRow.industry);
  const [linkedin, setLinkedin] = useState(clientRow.briefLinkedinUrl);
  const [internalNotes, setInternalNotes] = useState(clientRow.briefInternalNotes);
  const [accountManagerId, setAccountManagerId] = useState<string>(
    clientRow.briefAssignedAccountManagerId ?? "",
  );
  const [addr, setAddr] = useState(() => parseStructuredBusinessAddress(clientRow.briefBusinessAddress));
  const [main, setMain] = useState(() => parseBriefMainContact(clientRow.briefMainContact));
  const [taxonomy, setTaxonomy] = useState<TaxonomyState>(() => groupTaxonomy(taxonomyLinks));
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [filePending, setFilePending] = useState(false);

  const mainContact = useMemo(
    () =>
      main ?? {
        firstName: "",
        lastName: "",
        role: "",
        email: "",
        mobile: "",
        status: "active",
      },
    [main],
  );

  function setField<K extends keyof OpensDoorsBriefFields>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setMainField<K extends keyof NonNullable<typeof main>>(k: K, v: string) {
    setMain((m) => ({ ...(m ?? {}), [k]: v } as NonNullable<typeof m>));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const r = await saveClientBriefAction({
        clientId,
        website,
        industry,
        briefLinkedinUrl: linkedin,
        briefInternalNotes: internalNotes,
        briefAssignedAccountManagerId: accountManagerId || null,
        briefBusinessAddress: addr,
        briefMainContact: main,
        brief: {
          tradingName: form.tradingName,
          businessAddress: form.businessAddress,
          targetGeography: form.targetGeography,
          targetCustomerProfile: form.targetCustomerProfile,
          usps: form.usps,
          offer: form.offer,
          exclusions: form.exclusions,
          complianceNotes: form.complianceNotes,
          campaignObjective: form.campaignObjective,
          valueProposition: form.valueProposition,
          coreOffer: form.coreOffer,
          differentiators: form.differentiators,
          proofNotes: form.proofNotes,
        },
        taxonomy,
      });
      if (r.ok) {
        setMessage({ type: "ok", text: "Brief saved." });
        router.refresh();
      } else {
        setMessage({ type: "err", text: r.error });
      }
    });
  }

  async function onFileChange(f: File | null) {
    if (!f) return;
    setFilePending(true);
    setMessage(null);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("file", f);
    const r = await uploadCompliancePdfAction(fd);
    setFilePending(false);
    if (r.ok) {
      setMessage({ type: "ok", text: "PDF uploaded." });
      router.refresh();
    } else {
      setMessage({ type: "err", text: r.error });
    }
  }

  async function removeFile(id: string) {
    const r = await deleteComplianceAttachmentAction({ clientId, attachmentId: id });
    if (r.ok) {
      setMessage({ type: "ok", text: "Attachment removed." });
      router.refresh();
    } else {
      setMessage({ type: "err", text: r.error });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">A. Company identity</h2>
        <p className="text-sm text-muted-foreground">
          Public-facing facts. Workspace name <strong>{clientName}</strong> is the client
          title in OpensDoors — it is managed when the workspace was created.
        </p>
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Trading or legal name (optional)</Label>
            <Input
              className="max-w-2xl"
              value={form.tradingName ?? ""}
              onChange={(e) => setField("tradingName", e.target.value)}
              placeholder="If different from the workspace name"
            />
          </div>
          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
            />
          </div>
          <div>
            <Label htmlFor="in">Sector / business type</Label>
            <Input
              id="in"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. B2B professional services"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="li">Company LinkedIn</Label>
            <Input
              id="li"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://www.linkedin.com/company/…"
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Registered business address</h3>
          <BriefAddressBlock
            value={addr}
            legacyText={form.businessAddress ?? ""}
            onChange={setAddr}
          />
        </div>
      </section>

      <Separator className="opacity-60" />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">B. Main contact</h2>
        <p className="text-sm text-muted-foreground">
          Primary client-side contact for this engagement (not a mailbox / sender
          profile).
        </p>
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          {(
            [
              ["firstName", "First name"],
              ["lastName", "Last name"],
              ["role", "Role"],
              ["email", "Work email"],
              ["mobile", "Mobile"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <Label htmlFor={k}>{label}</Label>
              <Input
                id={k}
                value={String((mainContact as Record<string, string>)[k] ?? "")}
                onChange={(e) => setMainField(k, e.target.value)}
              />
            </div>
          ))}
          <div>
            <Label htmlFor="st">Status</Label>
            <Input
              id="st"
              value={String(mainContact.status ?? "active")}
              onChange={(e) => setMainField("status", e.target.value)}
              placeholder="active, paused, etc."
            />
          </div>
        </div>
      </section>

      <Separator className="opacity-60" />

      <section className="space-y-5">
        <h2 className="text-lg font-semibold tracking-tight">C. Service &amp; ICP</h2>
        <p className="text-sm text-muted-foreground">
          What you cover geographically and the roles you are pursuing. New values
          you add are saved and suggested for other clients.
        </p>
        <BriefTaxonomyChipsField
          kind="SERVICE_AREA"
          label="Service or target areas"
          description="Regions, cities, or territories — type to add several."
          value={taxonomy.SERVICE_AREA}
          onChange={(v) => setTaxonomy((t) => ({ ...t, SERVICE_AREA: v }))}
        />
        <BriefTaxonomyChipsField
          kind="TARGET_INDUSTRY"
          label="Target industries"
          value={taxonomy.TARGET_INDUSTRY}
          onChange={(v) => setTaxonomy((t) => ({ ...t, TARGET_INDUSTRY: v }))}
        />
        <BriefTaxonomyChipsField
          kind="COMPANY_SIZE"
          label="Target company sizes"
          value={taxonomy.COMPANY_SIZE}
          onChange={(v) => setTaxonomy((t) => ({ ...t, COMPANY_SIZE: v }))}
        />
        <BriefTaxonomyChipsField
          kind="JOB_TITLE"
          label="Target job titles or functions"
          value={taxonomy.JOB_TITLE}
          onChange={(v) => setTaxonomy((t) => ({ ...t, JOB_TITLE: v }))}
        />
        <div>
          <Label>Legacy: free-text geography / ICP (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Older briefs may still have narrative here — prefer structured chips above
            for new work.
          </p>
          <Textarea
            className="mt-1.5 min-h-[4rem] max-w-2xl"
            value={form.targetGeography ?? ""}
            onChange={(e) => setField("targetGeography", e.target.value)}
            rows={2}
            placeholder="Service areas in prose, if you still use this field"
          />
        </div>
        <Textarea
          className="min-h-[4rem] max-w-2xl"
          value={form.targetCustomerProfile ?? ""}
          onChange={(e) => setField("targetCustomerProfile", e.target.value)}
          rows={2}
          placeholder="Legacy: combined target customer paragraph (optional)"
        />
      </section>

      <Separator className="opacity-60" />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">D. Positioning &amp; proof</h2>
        {(
          [
            ["valueProposition", "Value proposition", 3],
            ["coreOffer", "Core offer", 3],
            ["differentiators", "Differentiators", 3],
            ["proofNotes", "Proof & case notes", 3],
            ["exclusions", "Exclusions / do-not-target", 2],
          ] as const
        ).map(([k, label, rows]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={k}>{label}</Label>
            <Textarea
              id={k}
              className="max-w-2xl"
              rows={rows}
              value={String((form as Record<string, string>)[k] ?? "")}
              onChange={(e) => setField(k, e.target.value)}
            />
          </div>
        ))}
      </section>

      <Separator className="opacity-60" />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">E. Compliance &amp; documents</h2>
        <div>
          <Label htmlFor="cn">Compliance notes</Label>
          <Textarea
            id="cn"
            className="min-h-[5rem] max-w-2xl"
            value={form.complianceNotes ?? ""}
            onChange={(e) => setField("complianceNotes", e.target.value)}
            rows={4}
          />
        </div>
        <div>
          <Label>Accreditations &amp; compliance PDFs</Label>
          <p className="text-xs text-muted-foreground">PDF only, up to 5MB each.</p>
          <div className="mt-2 space-y-2">
            {complianceFiles.map((c) => (
              <div
                key={c.id}
                className="flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  {c.fileName} · {Math.round(c.sizeBytes / 1024)} KB
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeFile(c.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Input
              type="file"
              accept="application/pdf"
              className="max-w-md cursor-pointer"
              disabled={filePending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onFileChange(f);
              }}
            />
            {filePending ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
          </div>
        </div>
      </section>

      <Separator className="opacity-60" />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">F. Internal ownership</h2>
        <div className="grid max-w-2xl gap-3">
          <div>
            <Label htmlFor="am">Assigned account manager</Label>
            <select
              id="am"
              className={cn(
                "mt-1 flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 text-sm",
                "shadow-sm focus-visible:ring-1 focus-visible:ring-ring",
              )}
              value={accountManagerId}
              onChange={(e) => setAccountManagerId(e.target.value)}
            >
              <option value="">— Not set —</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName || s.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="inotes">Internal notes (operators only)</Label>
            <Textarea
              id="inotes"
              className="min-h-[5rem] max-w-2xl"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </div>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        <strong>Sender names and email signatures</strong> are set per connected mailbox
        on the Mailboxes page, not in this brief.
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save brief"}
        </Button>
        {message ? (
          <p
            className={cn(
              "text-sm",
              message.type === "ok" ? "text-foreground" : "text-destructive",
            )}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
