/**
 * Lightweight loading skeleton shown by route-level `loading.tsx`
 * Suspense boundaries while a (dynamic) server page renders. Its whole
 * job is to give staff *immediate* visual feedback on navigation so a
 * click never looks frozen — which is what made people click twice.
 *
 * Pure presentational, no client JS, no data.
 */
export function PageSkeleton({
  tiles = 4,
  showTable = true,
}: {
  tiles?: number;
  showTable?: boolean;
}) {
  return (
    <div
      className="mx-auto max-w-7xl animate-pulse space-y-6"
      aria-busy="true"
      aria-label="Loading"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-56 max-w-full rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/60" />
      </div>

      {/* Metric / status tiles */}
      {tiles > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: tiles }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg border border-border/60 bg-muted/40"
            />
          ))}
        </div>
      ) : null}

      {/* Main content block */}
      {showTable ? (
        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <div className="h-5 w-40 rounded bg-muted/70" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-full rounded bg-muted/30" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
