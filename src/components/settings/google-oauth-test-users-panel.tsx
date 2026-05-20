import { buttonVariants } from "@/components/ui/button";

/**
 * Admin-only panel for Google OAuth consent screen test users.
 *
 * Google does NOT provide a public API to manage OAuth test users, and the
 * internal Cloud Console GraphQL endpoint only accepts live browser sessions
 * (it rejects service-account auth). So this card links straight to the exact
 * Console page rather than pretending to automate it.
 *
 * The real long-term fix is OAuth app verification + publishing, after which
 * test users are no longer required at all.
 */
export function GoogleOauthTestUsersPanel({
  consoleUrl,
}: {
  consoleUrl: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        While the Google OAuth app is in{" "}
        <span className="font-medium text-foreground">Testing</span> status,
        only explicitly listed test users can connect a Google Workspace
        mailbox. Add their email addresses on the consent screen&apos;s test
        users list, then they can complete the Google sign-in flow.
      </p>

      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Open the Google Cloud Console test users page below.</li>
        <li>
          Under <span className="font-medium text-foreground">Test users</span>,
          click <span className="font-medium text-foreground">+ Add users</span>.
        </li>
        <li>Enter the Google Workspace email address and save.</li>
      </ol>

      <a
        href={consoleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ size: "sm" })}
      >
        Open Google Cloud Console test users
      </a>

      <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Heads up:</span> Google has
        no public API to add test users programmatically, so this step is manual
        for now. The permanent fix is to verify and publish the OAuth app — after
        that, any Google Workspace user can connect with no test-user list needed.
      </p>
    </div>
  );
}
