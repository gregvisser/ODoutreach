import { Badge } from "@/components/ui/badge";

type Item = { label: string; ok: boolean; detail?: string };

export function TonightLaunchChecklist({
  items,
}: {
  items: Item[];
}) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((it) => (
        <li key={it.label} className="flex flex-wrap items-start gap-2">
          <Badge variant={it.ok ? "default" : "secondary"} className="shrink-0">
            {it.ok ? "Ready" : "Check"}
          </Badge>
          <span>
            <span className="font-medium text-foreground">{it.label}</span>
            {it.detail ? (
              <span className="text-muted-foreground"> — {it.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
      <li className="pt-2 text-xs text-muted-foreground">
        Known limitation: Google Workspace proof may use a Bidlow subdomain mailbox until OpensDoors
        provides their production Workspace sender.
      </li>
    </ul>
  );
}
