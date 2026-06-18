export type ContactImportBannerParams = {
  import?: string;
  imported?: string;
  attached?: string;
  skipped?: string;
  list?: string;
  batch?: string;
  uNew?: string;
  uMatch?: string;
  message?: string;
};

/**
 * Shared CSV-import result banner. `importContactsCsvAction` redirects back to
 * wherever the import was launched (the client Sources tab or the global
 * Contacts page) with `?import=ok|error&...`; this renders the outcome there so
 * the operator always sees "imported N / skipped M" (or the error) instead of
 * being bounced to an unrelated page with no feedback.
 *
 * Returns null when there is no import result in the params.
 */
export function ContactImportResultBanner({
  params,
}: {
  params: ContactImportBannerParams;
}) {
  if (params.import === "ok") {
    return (
      <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        Import finished — created{" "}
        <span className="font-medium">{params.imported ?? "0"}</span>
        {params.attached && params.attached !== "0" ? (
          <>
            , attached <span className="font-medium">{params.attached}</span>{" "}
            already-known
          </>
        ) : null}
        , skipped <span className="font-medium">{params.skipped ?? "0"}</span>
        {params.list ? (
          <>
            {" "}
            into list <span className="font-medium">{params.list}</span>
          </>
        ) : null}
        {params.batch ? (
          <>
            {" "}
            (batch <span className="font-mono text-xs">{params.batch}</span>)
          </>
        ) : null}
        .
        {params.uNew != null || params.uMatch != null ? (
          <>
            {" "}
            Universe: <span className="font-medium">{params.uNew ?? "0"}</span>{" "}
            new, <span className="font-medium">{params.uMatch ?? "0"}</span>{" "}
            matched existing.
          </>
        ) : null}
      </p>
    );
  }
  if (params.import === "error") {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Import failed: {params.message ?? "Unknown error"}
      </p>
    );
  }
  return null;
}
