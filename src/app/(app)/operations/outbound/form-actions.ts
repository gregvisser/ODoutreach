"use server";

import {
  operatorRequeueFailedAction,
  releaseStaleProcessingAction,
  verifySenderIdentityReadyAction,
} from "@/app/(app)/operations/outbound/actions";

export async function releaseStaleFormAction() {
  await releaseStaleProcessingAction();
}

export async function verifySenderFormAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return;
  await verifySenderIdentityReadyAction(clientId);
}

export async function requeueFailedFormAction(formData: FormData) {
  const outboundEmailId = String(formData.get("outboundEmailId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!outboundEmailId || !clientId) return;
  await operatorRequeueFailedAction({ outboundEmailId, clientId });
}
