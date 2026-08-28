"use client";

import { useState, useTransition } from "react";

import { setClientAccountGradeAction } from "@/app/(app)/clients/account-grade-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CLIENT_ACCOUNT_GRADES,
  clientAccountGradeDescription,
  clientAccountGradeLabel,
  type ClientAccountGrade,
} from "@/lib/clients/client-account-grade";

type Props = {
  clientId: string;
  grade: ClientAccountGrade | null;
  /**
   * The signature line, already formatted on the server by
   * `formatAccountGradeAttribution`. Null when nobody has graded the account.
   * Formatted server-side on purpose: the timestamp is built from UTC parts so
   * the server and client render identical markup.
   */
  attributionLine: string | null;
  canMutate: boolean;
};

/**
 * The account grade control, on the client account card.
 *
 * Two things here are requirements rather than decoration:
 *
 *  • The grade lives on the ACCOUNT CARD, not buried in settings. The owner
 *    asked for it where the account is, so whoever is looking at the client can
 *    see how it is handled.
 *  • The signature — "Set to Corporate (VIP) by Sophie, 28 Aug 14:02" — is
 *    rendered next to the control, not only written to an audit log. A change
 *    that decides how a client's cold outreach reaches strangers has to have a
 *    name against it that anyone can see without opening an audit page.
 */
export function ClientAccountGradeCard({
  clientId,
  grade,
  attributionLine,
  canMutate,
}: Props) {
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<ClientAccountGrade | null>(null);

  function choose(next: ClientAccountGrade) {
    if (next === grade) return;
    setNotice(null);
    setSaving(next);
    startTransition(async () => {
      const res = await setClientAccountGradeAction(clientId, next);
      setNotice(res.ok ? { type: "ok", text: res.message } : { type: "err", text: res.error });
      setSaving(null);
    });
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Account grade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          How carefully this client&apos;s outreach is handled.{" "}
          <strong className="text-foreground">{clientAccountGradeLabel(grade)}</strong> —{" "}
          {clientAccountGradeDescription(grade)}
        </p>

        {/* The signature. Deliberately prominent and deliberately plain. */}
        {attributionLine ? (
          <p className="text-xs text-foreground/80 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5">
            {attributionLine}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/60 px-2.5 py-1.5">
            Nobody has graded this account yet.
          </p>
        )}

        {canMutate ? (
          <div className="flex flex-wrap gap-2">
            {CLIENT_ACCOUNT_GRADES.map((option) => {
              const isCurrent = option === grade;
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
                  {saving === option ? "Saving…" : clientAccountGradeLabel(option)}
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
