"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  clientPickerSelectionLabel,
  filterClientPickerOptions,
  type ClientPickerOption,
} from "./client-picker-logic";

type ClientPickerProps = {
  clients: readonly ClientPickerOption[];
  /** Selected client id, or null for the all-clients option. */
  value: string | null;
  /** Visible name of the control, also used as the accessible name. */
  label?: string;
  /**
   * Label for the option that clears the client filter.
   * Pass null to hide that option (for example a required form field).
   */
  allLabel?: string | null;
  /** When set, choosing a client navigates to this URL. Preserves the caller's query shape. */
  hrefFor?: (clientId: string | null) => string;
  /** When set, choosing a client updates local state instead of navigating. */
  onValueChange?: (clientId: string | null) => void;
  /** Renders a hidden input so the choice submits with a surrounding form. */
  name?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function ClientPicker({
  clients,
  value,
  label = "Client",
  allLabel = "All accessible clients",
  hrefFor,
  onValueChange,
  name,
  disabled = false,
  placeholder = "Search clients",
}: ClientPickerProps) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selection = clientPickerSelectionLabel(
    clients,
    value,
    allLabel ?? placeholder,
  );
  const filtered = useMemo(
    () => filterClientPickerOptions(clients, query),
    [clients, query],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(clientId: string | null) {
    setOpen(false);
    setQuery("");
    if (hrefFor) {
      router.push(hrefFor(clientId));
      return;
    }
    onValueChange?.(clientId);
  }

  return (
    <div ref={rootRef} className="relative w-full min-w-0 max-w-sm">
      <label htmlFor={`${listId}-button`} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <button
        id={`${listId}-button`}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="truncate">{selection}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-72 overflow-y-auto py-1"
          >
            {allLabel ? (
              <li>
                <PickerOption
                  selected={value === null}
                  onClick={() => choose(null)}
                >
                  {allLabel}
                </PickerOption>
              </li>
            ) : null}
            {filtered.map((client) => (
              <li key={client.id}>
                <PickerOption
                  selected={value === client.id}
                  onClick={() => choose(client.id)}
                >
                  {client.name}
                </PickerOption>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                No clients match that search.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PickerOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-muted",
        selected && "bg-muted font-medium",
      )}
    >
      <Check
        className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
      <span className="truncate">{children}</span>
    </button>
  );
}
