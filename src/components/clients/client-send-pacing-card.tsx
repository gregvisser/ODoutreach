"use client";

import { useState, useTransition } from "react";

import { setClientSendBatchSizeAction } from "@/app/(app)/clients/send-pacing-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_SEND_BATCH_SIZE,
  MAX_SEND_BATCH_SIZE,
} from "@/lib/mailboxes/send-pacing";

type Props = {
  clientId: string;
  /** `Client.sendBatchSize` — null when this workspace uses the standard pace. */
  sendBatchSize: number | null;
  canMutate: boolean;
};

/**
 * How many outreach emails this workspace sends at a time.
 *
 * Deliberately plain English and no jargon: an operator setting this is
 * deciding how their client's mail looks arriving at a stranger's inbox, not
 * configuring a scheduler. The screen states the two things that are easy to
 * get wrong — that this changes the shape of the day and not the amount, and
 * that the daily cap per mailbox is still the ceiling.
 */
export function ClientSendPacingCard({
  clientId,
  sendBatchSize,
  canMutate,
}: Props) {
  const [value, setValue] = useState(
    sendBatchSize === null ? "" : String(sendBatchSize),
  );
  const [notice, setNotice] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  function save(next: number | null) {
    setNotice(null);
    startTransition(async () => {
      const res = await setClientSendBatchSizeAction(clientId, next);
      setNotice(
        res.ok
          ? { type: "ok", text: res.message }
          : { type: "err", text: res.error },
      );
    });
  }

  function onSave() {
    const trimmed = value.trim();
    if (trimmed === "") {
      save(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      setNotice({ type: "err", text: "Enter a whole number of emails." });
      return;
    }
    save(parsed);
  }

  const effective = sendBatchSize ?? DEFAULT_SEND_BATCH_SIZE;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sending pace</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Outreach goes out in small groups with a natural gap in between,
          rather than one every few minutes all day. This workspace currently
          sends{" "}
          <strong className="text-foreground">
            {effective} at a time
            {sendBatchSize === null ? " (the standard pace)" : ""}
          </strong>
          , spread across 7am–6pm on working days.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This changes <em>when</em> the day&apos;s email goes out, never how
          much. Each mailbox&apos;s daily limit is still the ceiling, and
          anything held back earlier in the day is released before the day ends.
        </p>
        {canMutate ? (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
            <div className="min-w-[10rem] flex-1 space-y-1">
              <label
                htmlFor="send-batch-size"
                className="text-xs font-medium text-foreground"
              >
                Emails per group (leave blank for the standard{" "}
                {DEFAULT_SEND_BATCH_SIZE})
              </label>
              <input
                id="send-batch-size"
                type="number"
                min={1}
                max={MAX_SEND_BATCH_SIZE}
                step={1}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={String(DEFAULT_SEND_BATCH_SIZE)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="text-xs"
              disabled={pending}
              onClick={onSave}
            >
              {pending ? "Saving…" : "Save pace"}
            </Button>
          </div>
        ) : null}
        {notice ? (
          <p
            className={
              notice.type === "ok"
                ? "text-xs text-emerald-800 dark:text-emerald-200"
                : "text-xs text-destructive"
            }
          >
            {notice.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
