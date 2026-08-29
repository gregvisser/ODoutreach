import Link from "next/link";

/**
 * Shared chrome for the two public legal pages (`/privacy`, `/terms`).
 *
 * These render for people who have no account and cannot get one: Google's
 * OAuth verification reviewer, and prospects who received outreach and want to
 * know who holds their details. So this shell deliberately does NOT use the
 * signed-in app shell (sidebar, header, brand lookup) — it must render with no
 * session and no database read.
 */

/**
 * Details that a lawyer, not an engineer, has to settle. They are gathered here
 * rather than scattered through the prose so there is exactly one place to
 * correct them, and the draft notice below names them as unconfirmed on screen
 * rather than letting them read as settled fact.
 */
export const LEGAL_OPERATOR_NAME = "OpensDoors";
export const LEGAL_CONTACT_EMAIL = "privacy@opensdoors.co.uk";
/**
 * The date both documents were first published. Each page may override it with
 * its own `lastUpdated`, because they change independently: sharing one date
 * would either backdate a document that just changed or claim a revision to one
 * that did not, and both are the same small dishonesty this page set exists to
 * avoid.
 */
export const LEGAL_LAST_UPDATED = "28 August 2026";

export function LegalDraftNotice() {
  return (
    <div
      data-testid="legal-draft-notice"
      className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="font-semibold">
        Draft — not yet reviewed, and not legal advice.
      </p>
      <p className="mt-2">
        This document was written by describing what the software actually does,
        line by line, so that it is accurate rather than generic. It has{" "}
        <strong>not</strong> been reviewed by a solicitor and it is not legal
        advice. Three things in it are placeholders awaiting confirmation: the
        registered legal entity and its address, whether{" "}
        {LEGAL_OPERATOR_NAME} or each customer is the data controller for
        prospect records, and whether{" "}
        <span className="font-mono">{LEGAL_CONTACT_EMAIL}</span> is a real,
        monitored mailbox.
      </p>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {heading}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/**
 * Called out visually because the honest answers are the ones a reader is most
 * likely to be looking for, and burying them in a wall of prose is how a policy
 * ends up technically true and practically misleading.
 */
export function LegalPlainly({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
      {children}
    </div>
  );
}

export function LegalPageShell({
  title,
  intro,
  lastUpdated = LEGAL_LAST_UPDATED,
  children,
}: {
  title: string;
  intro: string;
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-12 md:py-16">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {LEGAL_OPERATOR_NAME}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{intro}</p>
          <p className="text-xs text-muted-foreground">
            Last updated {lastUpdated}.
          </p>
        </header>

        <LegalDraftNotice />

        <div className="space-y-8">{children}</div>

        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link className="underline hover:text-foreground" prefetch={false} href="/privacy">
              Privacy Policy
            </Link>
            <Link className="underline hover:text-foreground" prefetch={false} href="/terms">
              Terms of Service
            </Link>
            <a
              className="underline hover:text-foreground"
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
