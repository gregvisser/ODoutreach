import type { ReactNode } from "react";

type Props = {
  isAdmin: boolean;
  children: ReactNode;
};

/**
 * Hides internal-only tooling from normal staff. Admins see a collapsed section.
 */
export function AdminOutreachDiagnosticsPanel({ isAdmin, children }: Props) {
  if (!isAdmin) {
    return null;
  }

  return (
    <details className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Admin diagnostics
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
