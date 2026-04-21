import { Badge } from "@/components/ui/badge";
import type { ContactReadinessStatusLabel } from "@/lib/client-contacts-readiness";
import { getContactStatusDisplay } from "@/lib/contacts/contact-status-display";
import { cn } from "@/lib/utils";

/**
 * PR F3 — consistent visual treatment for a contact readiness status.
 *
 * Renders a `<Badge>` with the canonical label + a `title` attribute so
 * operators can hover for the precise definition. Native `title` is
 * intentional — we do not want to introduce a heavy tooltip primitive
 * just for the four readiness states.
 */

type Props = {
  status: ContactReadinessStatusLabel;
  className?: string;
};

export function ContactReadinessBadge({ status, className }: Props) {
  const display = getContactStatusDisplay(status);
  return (
    <Badge
      variant={display.badgeVariant}
      title={display.tooltip}
      className={cn(className)}
    >
      {display.label}
    </Badge>
  );
}
