"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Submit button for a server-action `<form>` that auto-disables and shows a
 * busy label while the form's action is in flight (via `useFormStatus`).
 *
 * Must be rendered as a CHILD of the `<form>` whose submission it tracks. This
 * prevents the double-submit / double-send window that a plain
 * `<Button type="submit">` leaves open between click and the server redirect,
 * and gives the operator visible "working" feedback. It resets automatically
 * when the action completes (success OR error) — no manual state to get stuck.
 */
export function FormSubmitButton({
  children,
  pendingLabel = "Working…",
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type"> & {
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
