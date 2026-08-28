import Link from "next/link";

/**
 * Footer links to the public legal pages.
 *
 * Mounted in two places on purpose: inside the signed-in app shell, and on the
 * signed-out sign-in page. The sign-in page is the one that matters most —
 * it is the only page Google's OAuth reviewer and an unauthenticated visitor
 * can actually reach, so a footer that existed only behind the login would be
 * invisible to exactly the audience the pages were built for.
 */
export function LegalFooterLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground " +
        (className ?? "")
      }
    >
      <Link className="underline-offset-4 hover:underline" prefetch={false} href="/privacy">
        Privacy Policy
      </Link>
      <span aria-hidden="true">·</span>
      <Link className="underline-offset-4 hover:underline" prefetch={false} href="/terms">
        Terms of Service
      </Link>
    </nav>
  );
}
