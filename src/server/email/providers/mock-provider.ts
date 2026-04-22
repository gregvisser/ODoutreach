import { createHash } from "node:crypto";

import type { OutboundEmailProvider, SendEmailInput, SendEmailResult } from "./types";

/**
 * Deterministic mock sender for local/dev — does not hit the network.
 * Same idempotency key → same synthetic provider message id (duplicate-invocation safe).
 */
export class MockEmailProvider implements OutboundEmailProvider {
  readonly name = "mock";

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const basis =
      input.idempotencyKey?.trim() ??
      `${input.correlationId}:${input.to}:${input.subject}`;
    const h = createHash("sha256").update(basis).digest("hex").slice(0, 24);
    const providerMessageId = `mock_${h}`;
    return {
      ok: true,
      providerMessageId,
      providerName: this.name,
      raw: {
        simulated: true,
        to: input.to,
        idempotencyKey: input.idempotencyKey,
        extraHeaders: input.extraHeaders ?? [],
      },
    };
  }
}
