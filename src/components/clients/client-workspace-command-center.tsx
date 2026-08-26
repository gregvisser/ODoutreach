import { Badge } from "@/components/ui/badge";
import { ClientLogo } from "@/components/clients/client-logo";

type Props = {
  clientName: string;
  clientSlug: string;
  clientStatus: string;
  launchStageLabel: string;
  logoUrl?: string | null;
  logoAltText?: string | null;
};

/**
 * The workspace header. It deliberately does NOT list the seven modules: the
 * subnav tab row is the navigation and the Launch readiness panel is the
 * status. A numbered "Workflow" pill strip used to sit here as a third copy of
 * the same seven destinations — removed, because it carried nothing the
 * readiness rows do not say better.
 */
export function ClientWorkspaceCommandCenter({
  clientName,
  clientSlug,
  clientStatus,
  launchStageLabel,
  logoUrl = null,
  logoAltText = null,
}: Props) {
  return (
    <section aria-label="Client workspace header" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <ClientLogo
            clientName={clientName}
            logoUrl={logoUrl}
            logoAltText={logoAltText}
            size={56}
            className="mt-1"
          />
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Client workspace
            </p>
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight text-foreground">
              {clientName}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>
                Workspace ID <span className="font-mono text-foreground">{clientSlug}</span>
              </span>
              <Badge variant="outline">{clientStatus}</Badge>
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="self-start">
          {launchStageLabel}
        </Badge>
      </div>
    </section>
  );
}
