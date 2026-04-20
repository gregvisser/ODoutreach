import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CANONICAL_IMPORT_HEADINGS,
  CONTACT_IMPORT_CONTRACT_SUMMARY,
  EMAIL_REQUIRED_FOR_PERSISTENCE,
} from "@/lib/contact-import-contract";

/**
 * Read-only panel that documents the CSV / RocketReach heading contract for
 * staff on the Sources page (and can be reused elsewhere). Renders nothing
 * interactive — it never triggers an import.
 */
export function ContactImportContractPanel() {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Contact import contract</CardTitle>
        <CardDescription>
          CSV and RocketReach intake accept these headings. Fields may be
          empty. A row only needs one outreach identifier to count as a valid
          contact.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Accepted headings
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {CANONICAL_IMPORT_HEADINGS.map((heading) => (
              <li
                key={heading}
                className="rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs text-foreground"
              >
                {heading}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Valid contact
            </p>
            <p className="mt-1 text-sm">
              Not suppressed and has at least one of:{" "}
              <span className="font-medium">email</span>,{" "}
              <span className="font-medium">LinkedIn</span>,{" "}
              <span className="font-medium">mobile phone</span>, or{" "}
              <span className="font-medium">office phone</span>.
            </p>
          </div>
          <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Email-sendable
            </p>
            <p className="mt-1 text-sm">
              Valid contact <em>with</em> an email address. Pilot email sends
              only use email-sendable contacts.
            </p>
          </div>
        </div>

        <ul className="space-y-1 text-xs text-muted-foreground">
          {CONTACT_IMPORT_CONTRACT_SUMMARY.rules.map((rule) => (
            <li key={rule}>• {rule}</li>
          ))}
        </ul>

        {EMAIL_REQUIRED_FOR_PERSISTENCE ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            <strong>Note:</strong> email is currently required to persist a
            contact. LinkedIn-only and phone-only contacts will be storable
            once the email-optional persistence follow-up lands.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
