import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { humanizeLaunchBlocker } from "@/lib/clients/launch-blocker-copy";

type Props = {
  clientId: string;
  /** Raw launch-approval blockers from the activation policy (the real gate). */
  blockers: string[];
};

/**
 * "Not live yet — what's left to go live" card, shown on the overview while a
 * client is still ONBOARDING. Driven by the SAME blockers the auto-activation
 * gate evaluates, so it lists every requirement — including ones that aren't
 * visible as setup sections (a sender signature, a synced suppression sheet, an
 * eligible contact). This is why a client that "looks done" might not activate.
 */
export function ClientLaunchBlockersCard({ clientId, blockers }: Props) {
  if (blockers.length === 0) return null;
  const items = blockers.map(humanizeLaunchBlocker);

  return (
    <Card className="border-amber-400/70 bg-amber-50/70 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/25">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Not live yet — {String(blockers.length)} thing
          {blockers.length === 1 ? "" : "s"} left to go live
        </CardTitle>
        <CardDescription>
          This client activates automatically the moment every item below is
          done — these are the exact checks the system runs. Some aren&apos;t
          shown as setup steps (for example a mailbox signature or a synced
          suppression sheet), so a client can look finished but still wait here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={index}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/60 bg-background/60 px-3 py-2"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
              >
                !
              </span>
              <span className="min-w-0 flex-1 text-sm text-foreground">
                {item.text}
              </span>
              {item.hrefSuffix ? (
                <Link prefetch={false}
                  href={`/clients/${clientId}${item.hrefSuffix}`}
                  className="text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                  {item.actionLabel ?? "Open"}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
