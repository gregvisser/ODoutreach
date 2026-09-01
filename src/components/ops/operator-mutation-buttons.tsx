"use client";

import { useState, useTransition } from "react";

import {
  operatorRequeueFailedAction,
  releaseStaleProcessingAction,
  verifySenderIdentityReadyAction,
} from "@/app/(app)/operations/outbound/actions";
import { Button } from "@/components/ui/button";
import {
  actionErrorMessage,
  releaseStaleLocksMessage,
  requeueResultMessage,
  VERIFY_SENDER_SUCCESS_MESSAGE,
  type OperatorActionBanner,
} from "@/components/ops/operator-action-messages";
import { cn } from "@/lib/utils";

function ActionBanner({ banner }: { banner: OperatorActionBanner | null }) {
  if (!banner) return null;
  return (
    <p
      role="status"
      className={cn(
        "mt-1.5 max-w-xs text-xs font-medium",
        banner.tone === "err" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
      )}
    >
      {banner.text}
    </p>
  );
}

export function ReleaseStaleLocksButton() {
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<OperatorActionBanner | null>(null);

  function run() {
    setBanner(null);
    startTransition(async () => {
      try {
        const result = await releaseStaleProcessingAction();
        setBanner(releaseStaleLocksMessage(result.released));
      } catch (error) {
        setBanner(actionErrorMessage(error));
      }
    });
  }

  return (
    <div>
      <Button type="button" size="sm" onClick={run} disabled={pending}>
        {pending ? "Releasing…" : "Release stale locks"}
      </Button>
      <ActionBanner banner={banner} />
    </div>
  );
}

export function VerifySenderReadyButton({ clientId }: { clientId: string }) {
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<OperatorActionBanner | null>(null);

  function run() {
    setBanner(null);
    startTransition(async () => {
      try {
        await verifySenderIdentityReadyAction(clientId);
        setBanner({ tone: "ok", text: VERIFY_SENDER_SUCCESS_MESSAGE });
      } catch (error) {
        setBanner(actionErrorMessage(error));
      }
    });
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
        {pending ? "Marking…" : "Mark VERIFIED_READY"}
      </Button>
      <ActionBanner banner={banner} />
    </div>
  );
}

export function RequeueFailedButton({
  outboundEmailId,
  clientId,
}: {
  outboundEmailId: string;
  clientId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<OperatorActionBanner | null>(null);

  function run() {
    setBanner(null);
    startTransition(async () => {
      try {
        const result = await operatorRequeueFailedAction({ outboundEmailId, clientId });
        setBanner(requeueResultMessage(result));
      } catch (error) {
        setBanner(actionErrorMessage(error));
      }
    });
  }

  return (
    <span className="inline-block align-top">
      <Button type="button" size="sm" className="ml-2" onClick={run} disabled={pending}>
        {pending ? "Requeuing…" : "Requeue"}
      </Button>
      <ActionBanner banner={banner} />
    </span>
  );
}
