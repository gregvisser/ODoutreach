"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendMicrosoftGovernedTestAction } from "@/app/(app)/clients/governed-test-send-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  clientId: string;
  canMutate: boolean;
  hasGovernedMailbox: boolean;
  /** True when env OAuth is configured for the active governed mailbox's provider */
  oauthReadyForGovernedTest: boolean;
};

const EXAMPLE_INTERNAL = "you@bidlow.co.uk";

export function GovernedTestSendPanel({
  clientId,
  canMutate,
  hasGovernedMailbox,
  oauthReadyForGovernedTest,
}: Props) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate || !oauthReadyForGovernedTest || !hasGovernedMailbox) return;
    setMessage(null);
    const addr = to.trim();
    if (!addr) {
      setMessage({
        type: "err",
        text: "Enter the exact internal test recipient address (allowlisted domain only).",
      });
      return;
    }
    startTransition(async () => {
      const r = await sendMicrosoftGovernedTestAction(clientId, addr);
      if (r.ok) {
        setMessage({ type: "ok", text: r.message });
        router.refresh();
      } else {
        setMessage({ type: "err", text: r.error });
      }
    });
  };

  if (!oauthReadyForGovernedTest) {
    return (
      <p className="text-sm text-muted-foreground">
        Mailbox OAuth for the active governed sender provider is not configured in this
        environment (Microsoft and Google use separate app registrations).
      </p>
    );
  }

  if (!hasGovernedMailbox) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a Microsoft 365 or Google Workspace sending mailbox and ensure it is eligible
        (connected, sending allowed) to run the governed test send.
      </p>
    );
  }

  if (!canMutate) {
    return (
      <p className="text-sm text-muted-foreground">You do not have permission to queue this test.</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="governed-test-to">Internal test recipient (allowlisted domain only)</Label>
        <Input
          id="governed-test-to"
          type="email"
          autoComplete="off"
          placeholder={EXAMPLE_INTERNAL}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          External and non-allowlisted domains are rejected server-side. Configure allowlist with{" "}
          <code className="text-xs">GOVERNED_TEST_EMAIL_DOMAINS</code> in the app environment.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} size="sm" variant="secondary">
          {pending ? "Queueing…" : "Send test email"}
        </Button>
        <p className="text-xs text-muted-foreground">Subject and body are fixed; one governed send per action.</p>
      </div>
      {message ? (
        <p
          className={
            message.type === "ok" ? "text-sm text-emerald-600 dark:text-emerald-500" : "text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
