import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The one sparkles mark for every AI feature.
 * Colour, size and accessible name stay the same wherever it is used.
 */
export function AiIcon({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className="inline-flex">
      <Sparkles
        aria-label="AI"
        className={cn("size-4 shrink-0 text-primary", className)}
      />
    </span>
  );
}

export function AiBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <AiIcon />
      <span>{children}</span>
    </span>
  );
}

/** Reply label that came from the AI classifier. Unclassified rows do not use this. */
export function AiClassificationBadge({
  text,
  className,
  title,
}: {
  text: string;
  className?: string;
  title?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("w-fit gap-1 text-[11px]", className)}
    >
      <AiIcon className="size-3" />
      {text}
    </Badge>
  );
}
