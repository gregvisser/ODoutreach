import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Row 132 — "who is dealing with this reply, and is it still open." One
 * badge, reused on every screen that lists replies (the cross-client
 * waiting queue, a client's Activity tab) and on the reply detail page, so
 * the same three plain-English states read the same everywhere:
 * Unclaimed / claimed-by-someone / Handled by someone.
 *
 * Takes an already-resolved `{ text, tone }` (see
 * `replyOwnershipLabel` in `@/lib/inbox/reply-ownership`) rather than the
 * raw state, so this component works unchanged from a server page (the
 * cross-client queue) or as a prop into a "use client" list panel — no Date
 * object has to cross that boundary.
 */
export function ReplyOwnershipBadge({
  text,
  tone,
  testId,
}: {
  text: string;
  tone: "muted" | "warn" | "ok";
  testId?: string;
}) {
  return (
    <Badge
      variant="outline"
      data-testid={testId}
      className={cn(
        "w-fit font-normal",
        tone === "muted" && "text-muted-foreground",
        tone === "warn" &&
          "border-amber-400/50 bg-amber-50/60 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200",
        tone === "ok" &&
          "border-emerald-400/50 bg-emerald-50/60 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200",
      )}
    >
      {text}
    </Badge>
  );
}
