export type OperationalSnapshotItem = {
  label: string;
  value: string;
  hint?: string;
};

export function ClientOperationalSnapshot({ items }: { items: OperationalSnapshotItem[] }) {
  return (
    <section aria-label="Operational snapshot" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">Operational snapshot</h2>
        <p className="text-xs text-muted-foreground">
          A compact view of capacity, contacts, and latest activity.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-lg border border-border/80 bg-card/60 px-3 py-2.5"
          >
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {it.label}
            </dt>
            <dd className="mt-1 text-base font-semibold leading-tight tabular-nums text-foreground">
              {it.value}
            </dd>
            {it.hint ? (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{it.hint}</p>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
