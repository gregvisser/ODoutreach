import type { OutboundEmailProvider, SendEmailInput, SendEmailResult } from "./types";

/**
 * Resend REST API — enable with RESEND_API_KEY. Not required for first-pass local dev.
 */
export class ResendEmailProvider implements OutboundEmailProvider {
  readonly name = "resend";

  constructor(private readonly apiKey: string) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (input.idempotencyKey?.trim()) {
      headers["Idempotency-Key"] = input.idempotencyKey.trim();
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        text: input.bodyText,
        headers: {
          "X-OpensDoors-Correlation-Id": input.correlationId,
        },
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: json.message ?? res.statusText,
        code: String(res.status),
      };
    }

    if (!json.id) {
      return { ok: false, error: "Resend response missing id" };
    }

    return {
      ok: true,
      providerMessageId: json.id,
      providerName: this.name,
      raw: json,
    };
  }
}
