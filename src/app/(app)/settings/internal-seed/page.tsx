import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  isInternalSeedAllowlistEnabled,
  listAllInternalSeedAddresses,
} from "@/server/internal-seed/seed-allowlist";

import {
  addInternalSeedAddressAction,
  setInternalSeedAddressActiveAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Feature A — admin surface for the internal seed / allowlist. Super-admin
 * (owner) only. Lists the always-deliverable internal test addresses, clearly
 * flagged as internal test addresses, and lets the owner add / activate /
 * deactivate them. The list can be curated whether or not the feature flag is
 * on; a banner makes the active/inactive state explicit.
 */
export default async function InternalSeedPage() {
  const staff = await requireOpensDoorsStaff();

  if (!staff.isSuperAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Internal test addresses</h1>
        <p className="text-muted-foreground">
          Only the owner account can manage internal test addresses.
        </p>
        <Link prefetch={false}
          href="/settings"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
        >
          Back to settings
        </Link>
      </div>
    );
  }

  const enabled = isInternalSeedAllowlistEnabled();
  const rows = await listAllInternalSeedAddresses();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Internal test addresses
          </h1>
          <p className="mt-1 text-muted-foreground">
            OpensDoors-internal test inboxes that are <strong>always
            deliverable</strong>. They are exempt from the suppression gate at
            send time, and no automated process (import, list refresh, bounce or
            spam-complaint) can ever add them to a suppression list. They are
            also excluded from real campaign analytics.
          </p>
        </div>
        <Link prefetch={false}
          href="/settings"
          className={cn(buttonVariants({ variant: "ghost" }), "text-sm shrink-0")}
        >
          ← Back to settings
        </Link>
      </div>

      <div
        className={cn(
          "rounded-md border px-4 py-3 text-sm",
          enabled
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-amber-300 bg-amber-50 text-amber-900",
        )}
      >
        {enabled ? (
          <span>
            <strong>Active.</strong> The internal-seed allowlist is switched on
            (<code>INTERNAL_SEED_ALLOWLIST_ENABLED=true</code>). Active addresses
            below are always deliverable.
          </span>
        ) : (
          <span>
            <strong>Not active yet.</strong> The feature flag
            (<code>INTERNAL_SEED_ALLOWLIST_ENABLED</code>) is off, so these
            exemptions are <strong>not</strong> applied to sending. You can still
            curate the list here; switch the flag on to activate it.
          </span>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Add an internal test address</h2>
        <form
          action={addInternalSeedAddressAction}
          className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-end"
        >
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              type="email"
              name="email"
              required
              placeholder="name@opensdoors.co.uk"
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Label (optional)</span>
            <input
              type="text"
              name="label"
              placeholder="Adam (internal test)"
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "default" }), "shrink-0")}
          >
            Add address
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Internal test addresses ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No internal test addresses yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.email}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Internal test address
                    </span>
                    {row.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  {row.label ? (
                    <p className="truncate text-sm text-muted-foreground">
                      {row.label}
                    </p>
                  ) : null}
                </div>
                <form action={setInternalSeedAddressActiveAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={row.isActive ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "shrink-0",
                    )}
                  >
                    {row.isActive ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
