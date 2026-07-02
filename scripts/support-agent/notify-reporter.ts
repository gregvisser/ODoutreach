/**
 * Transactional "your support ticket was actioned" email — internal use only.
 *
 * Sends ONE plain-text email via Microsoft Graph app-only sendMail, from a
 * system mailbox (SUPPORT_AGENT_NOTIFY_SENDER) to the ticket's own reporter
 * address, optionally BCC'ing internal address(es) (SUPPORT_AGENT_NOTIFY_BCC,
 * comma-separated) so staff keep a copy of every ticket-close notice. This is
 * completely separate from the outreach/campaign/sequence/queue pipeline: no
 * ledger, no suppression, no unsubscribe, no client mailbox. It must stay that way.
 *
 * Best-effort by contract: any problem (missing creds, token failure, non-2xx
 * from Graph) logs a warning and returns. It NEVER throws, so closing a ticket
 * is never blocked by email delivery.
 *
 * Requires the Azure AD app to hold application permission `Mail.Send`
 * (admin-consented) plus a real sender mailbox. The app currently uses delegated
 * `Mail.Read` for inbox sync, so app-only send may not be granted yet — in that
 * case Graph returns 403 and this simply no-ops.
 */
export async function notifyReporter(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const tenant = process.env.MS_GRAPH_TENANT_ID ?? process.env.AZURE_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID ?? process.env.AZURE_CLIENT_ID;
  const secret =
    process.env.MS_GRAPH_CLIENT_SECRET ?? process.env.AZURE_CLIENT_SECRET;
  const sender = process.env.SUPPORT_AGENT_NOTIFY_SENDER; // e.g. support@bidlow.co.uk
  // Optional internal BCC (comma-separated) — every ticket-close notice is copied here.
  const bccList = (process.env.SUPPORT_AGENT_NOTIFY_BCC ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (!tenant || !clientId || !secret || !sender) {
    console.warn(
      "notify-reporter: Graph creds/sender not set — skipping email (ticket still closed).",
    );
    return;
  }
  if (!to) {
    console.warn("notify-reporter: no reporter address — skipping email.");
    return;
  }

  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );
    const token: { access_token?: string } = await tokenRes.json();
    if (!token.access_token) {
      console.warn("notify-reporter: no access token — skipping email.");
      return;
    }

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "Text", content: body },
            toRecipients: [{ emailAddress: { address: to } }],
            ...(bccList.length
              ? {
                  bccRecipients: bccList.map((a) => ({
                    emailAddress: { address: a },
                  })),
                }
              : {}),
          },
          saveToSentItems: true,
        }),
      },
    );
    if (!res.ok) {
      console.warn(
        `notify-reporter: Graph sendMail ${res.status} — skipping (ticket still closed).`,
      );
    }
  } catch (e) {
    console.warn("notify-reporter: send failed — skipping (ticket still closed).", e);
  }
}
