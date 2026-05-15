"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  UNIVERSE_CONTACT_FIELD_COLUMNS,
  UNIVERSE_CONTACT_FIELD_KEYS,
  serializeUniverseVisibleColumns,
  type UniverseContactFieldKey,
} from "@/lib/universe/column-config";

/**
 * PR #138 — Universe table column-visibility controls.
 *
 * Renders a small panel of checkboxes (one per contact-field column) and
 * writes the selection back into the URL via the `cols=` parameter. The
 * server page parses the param and only renders the chosen columns. This
 * keeps the control state shareable / bookmarkable and survives reloads.
 *
 * "Show all twelve" removes the `cols=` parameter (legacy default).
 * "Hide all twelve" sets `cols=` to an empty string so the table still
 * shows the non-toggleable system columns (Source / Last seen / Refs).
 */
export function UniverseColumnControls({
  visibleKeys,
}: {
  visibleKeys: ReadonlySet<UniverseContactFieldKey>;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function commit(next: Set<UniverseContactFieldKey>) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    if (next.size === UNIVERSE_CONTACT_FIELD_KEYS.length) {
      // Show all twelve -> drop the param (cleaner URL).
      params.delete("cols");
    } else {
      params.set("cols", serializeUniverseVisibleColumns(next));
    }
    params.set("page", "1");
    startTransition(() => {
      router.push(`/universe?${params.toString()}`);
    });
  }

  function toggle(key: UniverseContactFieldKey) {
    const next = new Set(visibleKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commit(next);
  }

  function showAll() {
    commit(new Set(UNIVERSE_CONTACT_FIELD_KEYS));
  }

  function hideAll() {
    commit(new Set());
  }

  const visibleCount = visibleKeys.size;
  const totalCount = UNIVERSE_CONTACT_FIELD_KEYS.length;

  return (
    <details className="rounded-lg border border-border/80 bg-card p-3 shadow-sm">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        Columns shown ({visibleCount} of {totalCount})
        <span className="ml-2 text-xs text-muted-foreground">
          (hide columns to fit your screen — choice is saved in the URL)
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 md:grid-cols-4">
          {UNIVERSE_CONTACT_FIELD_COLUMNS.map((col) => {
            const id = `universe-col-${col.key}`;
            const checked = visibleKeys.has(col.key);
            return (
              <label
                key={col.key}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  disabled={pending}
                  onChange={() => toggle(col.key)}
                  aria-label={`Toggle ${col.label} column`}
                />
                <span className="text-xs">{col.label}</span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || visibleCount === totalCount}
            onClick={showAll}
          >
            Show all twelve
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || visibleCount === 0}
            onClick={hideAll}
          >
            Hide all twelve
          </Button>
        </div>
      </div>
    </details>
  );
}
