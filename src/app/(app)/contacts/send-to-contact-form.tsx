"use client";

import { useFormStatus } from "react-dom";

import { sendEmailToContactAction } from "@/app/(app)/email/send-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  contactId: string;
  toEmail: string;
  contactLabel: string;
  isSuppressed: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Sending…" : "Send email"}
    </Button>
  );
}

export function SendToContactForm({
  clientId,
  contactId,
  toEmail,
  contactLabel,
  isSuppressed,
}: Props) {
  return (
    <Sheet>
      <SheetTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "shrink-0",
        )}
      >
        Send
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Send to {contactLabel}</SheetTitle>
          <SheetDescription className="font-mono text-xs">{toEmail}</SheetDescription>
        </SheetHeader>
        <form action={sendEmailToContactAction} className="flex flex-1 flex-col gap-4 px-4 pb-4">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="contactId" value={contactId} />
          {isSuppressed ? (
            <p
              className={cn(
                "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100",
              )}
            >
              This address is on the suppression list for this workspace. Submitting will record a
              blocked outcome — nothing is sent.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`sub-${contactId}`}>Subject</Label>
            <Input
              id={`sub-${contactId}`}
              name="subject"
              required
              placeholder="Intro — quick question"
              autoComplete="off"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <Label htmlFor={`body-${contactId}`}>Message</Label>
            <textarea
              id={`body-${contactId}`}
              name="bodyText"
              required
              rows={8}
              placeholder="Plain text body (ops preview is stored on the outbound record)."
              className={cn(
                "min-h-[160px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
                "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
              )}
            />
          </div>
          <SheetFooter className="flex-row justify-end gap-2 sm:justify-end">
            <SubmitButton />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
