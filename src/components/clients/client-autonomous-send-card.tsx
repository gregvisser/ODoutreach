"use client";

import { useState, useTransition } from "react";

import { setClientAutonomousSendAction } from "@/app/(app)/clients/autonomous-send-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AUTONOMOUS_SEND_SETTINGS,
  autonomousSendDescription,
  autonomousSendLabel,
  autonomousSendSetting,
  autonomousSendSettingLabel,
  type AutonomousSendSetting,
} from "@/lib/clients/client-autonomous-send";

type Props = {
  clientId: string;
  /** `Client.autonomousSendEnabled` — three states, `null` meaning nobody decided. */
  enabled: boolean | null;
  /**
   * The signature line, already formatted on the server by
   * `formatAutonomousSendAttribution`. Null when nobody has set the switch.
   * Formatted server-side on purpose: the timestamp is built from UTC parts so
   * the server and the client render identical markup.
   */
  attributionLine: string | null;
  canMutate: boolean;
};

/**
 * The machine-sending / human-sending switch, on the client account card.
 *
 * Two things here are requirements rather than decoration:
 *
 *  • The switch lives on the ACCOUNT CARD, next to the grade, not buried in
 *    settings. The owner asked for both where the account is.
 *  • The signature — "Set to Machine sending by Sophie, 28 Aug 14:02" — renders
 *    next to the control, not only in an audit log. A decision that lets a
 *    machine cold-email a stranger from this client's own domain has to have a
 *    name against it that anyone can see without opening an audit page.
 *
 * The unset state is shown honestly rather than hidden or defaulted, because
 * "nobody has chosen yet" is a real state of this client and the system refuses
 * to send on its own until somebody does.
 */
export function ClientAutonomousSendCard({
  clientId,
  enabled,
  attributionLine,
  canMutate,
}: Props) {
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<AutonomousSendSetting | null>(null);

  const current = autonomousSendSetting(enabled);

  function choose(next: AutonomousSendSetting) {
    if (next === current) return;
    setNotice(null);
    setSaving(next);
    startTransition(async () => {
      const res = await setClientAutonomousSendAction(clientId, next);
      setNotice(res.ok ? { type: "ok", text: res.message } : { type: "err", text: res.error });
      setSaving(null);
    });
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Autonomous sending</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Who sends this client&apos;s outreach.{" "}
          <strong className="text-foreground">{autonomousSendLabel(enabled)}</strong> —{" "}
          {autonomousSendDescription(enabled)}
        </p>

        {/* The signature. Deliberately prominent and deliberately plain. */}
        {attributionLine ? (
          <p className="text-xs text-foreground/80 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5">
            {attributionLine}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/60 px-2.5 py-1.5">
            Nobody has set this switch yet, so the system will not send for this client on its
            own.
          </p>
        )}

        {canMutate ? (
          <div className="flex flex-wrap gap-2">
            {AUTONOMOUS_SEND_SETTINGS.map((option) => {
              const isCurrent = option === current;
              return (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={isCurrent ? "default" : "secondary"}
                  className="text-xs"
                  disabled={pending || isCurrent}
                  aria-pressed={isCurrent}
                  onClick={() => {
                    choose(option);
                  }}
                >
                  {saving === option ? "Saving…" : autonomousSendSettingLabel(option)}
                </Button>
              );
            })}
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
