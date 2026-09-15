import { Button } from "@/components/ui/button";

export function OptionalAiUnavailable({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" disabled>{label}</Button>
      <p className="text-sm text-muted-foreground">
        This optional AI tool is switched off. You can still write, review and
        schedule emails yourself using Human sending.
      </p>
    </div>
  );
}
