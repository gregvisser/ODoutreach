"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { createSupportTicket } from "@/app/(app)/support/actions";

const PRIORITIES = [
  { value: "LOW", label: "Low — minor / cosmetic" },
  { value: "MEDIUM", label: "Medium — affects my work" },
  { value: "HIGH", label: "High — blocking a task" },
  { value: "CRITICAL", label: "Critical — system unusable" },
];

export function SupportTicketForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);

  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setBanner(null);
          const r = await createSupportTicket(fd);
          if (r.ok) {
            setBanner({ type: "ok", text: "Ticket logged. Thanks — we'll review it." });
            formRef.current?.reset();
            router.refresh();
          } else {
            setBanner({ type: "err", text: r.error });
          }
        });
      }}
    >
      {banner && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            banner.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {banner.text}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="t-title">Short title</Label>
        <Input
          id="t-title"
          name="title"
          required
          maxLength={200}
          placeholder="e.g. Can't connect a Google mailbox"
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-desc">What&apos;s the issue? (in detail)</Label>
        <Textarea
          id="t-desc"
          name="description"
          required
          rows={5}
          placeholder="Describe what you were doing, what you expected, and what actually happened."
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-priority">Importance</Label>
        <select
          id="t-priority"
          name="priority"
          defaultValue="MEDIUM"
          disabled={pending}
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-files">Screenshots (optional, up to 3)</Label>
        <Input
          id="t-files"
          name="files"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPG, GIF or WEBP — max 5MB each. Select up to 3 (only the first 3
          are kept).
        </p>
      </div>

      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Logging…" : "Log ticket"}
      </Button>
    </form>
  );
}
