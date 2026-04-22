/**
 * Outbound send provider boundary — implement once per ESP (Resend, Postmark, SendGrid, etc.).
 * All sends are server-side only.
 */

export type SendEmailInput = {
  correlationId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  /** Optional tags for provider dashboards — never include other tenants’ clientIds in unsafe ways */
  tag?: string;
  /** Per-attempt key — Resend `Idempotency-Key`; mock uses deterministic ids */
  idempotencyKey?: string;
  /**
   * Compliance headers emitted alongside the message body. Providers
   * that support arbitrary outbound headers (Resend, mock) pass these
   * through verbatim; providers with restrictions (Graph) map known
   * names (e.g. `List-Unsubscribe`) onto their native mechanism.
   * Safe to omit — callers without a hosted unsubscribe URL should
   * pass `undefined` rather than invented values.
   */
  extraHeaders?: ReadonlyArray<{ name: string; value: string }>;
};

export type SendEmailSuccess = {
  ok: true;
  providerMessageId: string;
  providerName: string;
  raw?: unknown;
};

export type SendEmailFailure = {
  ok: false;
  error: string;
  code?: string;
};

export type SendEmailResult = SendEmailSuccess | SendEmailFailure;

export interface OutboundEmailProvider {
  readonly name: string;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
