"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { searchBriefTaxonomyAction } from "@/app/(app)/clients/client-brief-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Kind = "SERVICE_AREA" | "TARGET_INDUSTRY" | "COMPANY_SIZE" | "JOB_TITLE";

type Props = {
  kind: Kind;
  label: string;
  description?: string;
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
};

export function BriefTaxonomyChipsField({
  kind,
  label,
  description,
  value,
  onChange,
  className,
}: Props) {
  const id = useId();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; displayValue: string }[]>([]);
  const [open, setOpen] = useState(false);

  const doSearch = useCallback(
    async (query: string) => {
      const t = query.trim();
      if (t.length < 1) {
        setSuggestions([]);
        return;
      }
      const r = await searchBriefTaxonomyAction({ kind, q: t });
      if (r.ok) {
        setSuggestions(r.terms.filter((x) => !value.includes(x.displayValue)));
      }
    },
    [kind, value],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void doSearch(q);
    }, 250);
    return () => clearTimeout(t);
  }, [q, doSearch]);

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (value.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
    setQ("");
    setSuggestions([]);
    setOpen(false);
  }

  function removeAt(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div>
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="relative max-w-2xl">
        <div className="flex gap-2">
          <Input
            id={id}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Type to search or add…"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(q);
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={() => addTag(q)}>
            Add
          </Button>
        </div>
        {open && suggestions.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover text-sm shadow-md">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted"
                  onClick={() => addTag(s.displayValue)}
                >
                  {s.displayValue}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((tag, i) => (
            <span
              key={`${tag}-${String(i)}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-sm"
            >
              {tag}
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
