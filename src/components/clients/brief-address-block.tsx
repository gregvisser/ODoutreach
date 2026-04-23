"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { searchAddressesAction } from "@/app/(app)/clients/search-address-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ADDRESS_SEARCH_MIN_LEN } from "@/lib/address-lookup/address-search-input";
import type { AddressLookupResult, AddressSuggestion } from "@/lib/address-lookup/types";

type Structured = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  formattedSummary: string;
};

const empty: Structured = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  formattedSummary: "",
};

const LOOKUP_DEBOUNCE_MS = 400;

type Props = {
  value: Partial<Structured> | null;
  legacyText: string;
  onChange: (next: Partial<Structured>) => void;
};

export function BriefAddressBlock({ value, legacyText, onChange }: Props) {
  const baseId = useId();
  const v = { ...empty, ...value };
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showManual, setShowManual] = useState(true);
  const [providerHint, setProviderHint] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [noMatchHint, setNoMatchHint] = useState(false);
  const [pending, start] = useTransition();
  const runSeq = useRef(0);
  const qRef = useRef(q);

  function applyStructured(s: AddressSuggestion["structured"]) {
    onChange({
      line1: s.line1,
      line2: s.line2 ?? "",
      city: s.city ?? "",
      region: s.region ?? "",
      postalCode: s.postalCode ?? "",
      country: s.country ?? "",
      formattedSummary: s.formattedSummary,
    });
  }

  function applySearchResult(
    r: AddressLookupResult,
  ) {
    if (!r.providerConfigured) {
      setProviderHint(
        "Address lookup is not set up in this environment. You can type the business address in the fields below.",
      );
    } else {
      setProviderHint(null);
    }
    setLookupMessage(r.lookupMessage ?? null);
    if (r.providerConfigured && r.noMatches) {
      setNoMatchHint(true);
    } else {
      setNoMatchHint(false);
    }
    setSuggestions(r.suggestions);
    setShowManual(true);
  }

  function runSearch(query: string) {
    const t = query.trim();
    qRef.current = query;
    start(async () => {
      const my = ++runSeq.current;
      const r = await searchAddressesAction(t);
      if (my !== runSeq.current) {
        return;
      }
      if (qRef.current.trim() !== t) {
        return;
      }
      applySearchResult(r);
    });
  }

  useEffect(() => {
    const t = q.trim();
    if (t.length < ADDRESS_SEARCH_MIN_LEN) {
      return;
    }
    const id = window.setTimeout(() => {
      start(async () => {
        const my = ++runSeq.current;
        const r = await searchAddressesAction(t);
        if (my !== runSeq.current) {
          return;
        }
        if (qRef.current.trim() !== t) {
          return;
        }
        applySearchResult(r);
      });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [q, start]);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${baseId}-q`}>Search address (postcode or street)</Label>
        <p className="text-xs text-muted-foreground">
          Suggestions update as you type. You can always type the full address in the
          fields below.
        </p>
        <div className="mt-1.5 flex max-w-2xl gap-2">
          <Input
            id={`${baseId}-q`}
            value={q}
            onChange={(e) => {
              const next = e.target.value;
              setQ(next);
              qRef.current = next;
              if (next.trim().length < ADDRESS_SEARCH_MIN_LEN) {
                setSuggestions([]);
                setNoMatchHint(false);
                setLookupMessage(null);
                setProviderHint(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (q.trim().length >= ADDRESS_SEARCH_MIN_LEN) {
                  runSearch(q);
                }
              }
            }}
            placeholder="e.g. SW1A 1AA or 10 Downing Street"
            className="flex-1"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className={cn(
              "shrink-0 rounded-md border border-border bg-background px-3 text-sm font-medium",
              "hover:bg-muted",
            )}
            onClick={() => {
              if (q.trim().length >= ADDRESS_SEARCH_MIN_LEN) {
                runSearch(q);
              }
            }}
            disabled={pending || q.trim().length < ADDRESS_SEARCH_MIN_LEN}
            title={q.trim().length < ADDRESS_SEARCH_MIN_LEN ? "Type at least 3 characters" : "Search now"}
          >
            {pending ? "…" : "Search"}
          </button>
        </div>
        {providerHint ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">{providerHint}</p>
        ) : null}
        {lookupMessage ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">{lookupMessage}</p>
        ) : null}
        {noMatchHint && !lookupMessage && !providerHint && suggestions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No matches for that search. Try a different postcode or street, or type the
            address below.
          </p>
        ) : null}
        {suggestions.length > 0 ? (
          <ul className="mt-2 max-h-44 max-w-2xl overflow-auto rounded-md border border-border bg-popover text-sm shadow">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted"
                  onClick={() => applyStructured(s.structured)}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {legacyText.trim().length > 0 && !v.line1 ? (
        <p className="text-xs text-muted-foreground">
          Legacy free-text address on file. Saving structured fields keeps the old
          line available until you replace it.
        </p>
      ) : null}

      {showManual ? (
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${baseId}-l1`}>Address line 1</Label>
            <Input
              id={`${baseId}-l1`}
              value={v.line1}
              onChange={(e) => onChange({ ...v, line1: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${baseId}-l2`}>Address line 2 (optional)</Label>
            <Input
              id={`${baseId}-l2`}
              value={v.line2}
              onChange={(e) => onChange({ ...v, line2: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${baseId}-city`}>City / town</Label>
            <Input
              id={`${baseId}-city`}
              value={v.city}
              onChange={(e) => onChange({ ...v, city: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${baseId}-region`}>Region / state</Label>
            <Input
              id={`${baseId}-region`}
              value={v.region}
              onChange={(e) => onChange({ ...v, region: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${baseId}-pc`}>Postal code</Label>
            <Input
              id={`${baseId}-pc`}
              value={v.postalCode}
              onChange={(e) => onChange({ ...v, postalCode: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor={`${baseId}-country`}>Country</Label>
            <Input
              id={`${baseId}-country`}
              value={v.country}
              onChange={(e) => onChange({ ...v, country: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${baseId}-fs`}>Formatted one-line (optional)</Label>
            <Input
              id={`${baseId}-fs`}
              value={v.formattedSummary}
              onChange={(e) => onChange({ ...v, formattedSummary: e.target.value })}
              placeholder="Shown when a lookup or manual summary is available"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
