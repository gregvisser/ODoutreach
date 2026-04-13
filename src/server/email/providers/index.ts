import "server-only";

import { MockEmailProvider } from "./mock-provider";
import { ResendEmailProvider } from "./resend-provider";
import type { OutboundEmailProvider } from "./types";

/**
 * `EMAIL_PROVIDER`: `mock` (default) | `resend`
 * Resend: set `RESEND_API_KEY`
 */
export function getOutboundEmailProvider(): OutboundEmailProvider {
  const mode = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase().trim();

  if (mode === "resend") {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) {
      throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    }
    return new ResendEmailProvider(key);
  }

  return new MockEmailProvider();
}

export type { OutboundEmailProvider, SendEmailInput, SendEmailResult } from "./types";
