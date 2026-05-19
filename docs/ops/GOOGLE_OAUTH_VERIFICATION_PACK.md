# Google OAuth verification pack

This pack supports Google verification for ODoutreach Google Workspace mailbox OAuth.

## Current requested Google scopes

ODoutreach requests these scopes for the mailbox OAuth client:

| Scope | Category | Why ODoutreach needs it |
| --- | --- | --- |
| `openid` | OpenID Connect | Identifies the Google account that completed mailbox OAuth. |
| `email` | OpenID Connect | Reads the consenting Google account email so ODoutreach can confirm it matches or can access the mailbox row. |
| `profile` | OpenID Connect | Completes the standard Google userinfo profile response used during OAuth validation. |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | Sends approved outreach and replies from the connected mailbox through the Gmail API. |
| `https://www.googleapis.com/auth/gmail.readonly` | Restricted | Reads recent inbox message metadata/snippets for reply sync, fetches selected message bodies for staff-visible reply detail, checks mailbox profile access, and reads Gmail send-as settings/signature for sender setup. |

ODoutreach does not request `https://mail.google.com/`, `gmail.modify`, `gmail.compose`, `gmail.insert`, `gmail.metadata`, `gmail.settings.basic`, or `gmail.settings.sharing`.

## Scope justification

`gmail.send` is the least-privilege Gmail send scope. ODoutreach uses Gmail API `users.messages.send` for outbound messages and replies. It does not need draft management or full mailbox access to send.

`gmail.readonly` remains required because ODoutreach is not only a sender. It monitors connected client mailboxes for replies, links replies back to the matching ODoutreach activity, shows staff the received reply detail, verifies that the consenting Google account can access the mailbox row, and reads Gmail send-as settings/signature for mailbox setup. `gmail.send` alone would break reply sync, reply matching, message-detail review, and Gmail signature readback.

`https://mail.google.com/` is not requested because ODoutreach does not need full mailbox control or immediate permanent deletion.

## What ODoutreach does with Gmail data

- Stores encrypted OAuth refresh/access credentials for each connected mailbox row.
- Sends approved outreach/reply messages through Gmail API for the connected mailbox.
- Reads recent inbox messages for connected mailboxes to detect replies.
- Stores reply metadata needed for Activity: provider message id, sender/recipient, subject, snippet/body preview, received timestamp, thread id, and selected RFC 5322 message-id metadata.
- Fetches full body text for a selected inbound message when staff open the message detail.
- Reads Gmail send-as settings/signature to help staff configure sender display name and signature.
- Uses Gmail data only for ODoutreach mailbox sending, reply tracking, staff review, and sender setup.

## What ODoutreach does not do

- No immediate or permanent deletion of Gmail messages or threads.
- No label modification, archive, move, trash, draft management, forwarding-rule management, or delegate management.
- No unrelated inbox browsing UI.
- No contact import from Gmail.
- No sale of Google user data.
- No use of Google user data for advertising.
- No transfer of Google user data to unrelated third parties.

## OAuth consent screen values

- App name: `ODoutreach`
- User support email: use the monitored Bidlow/OpenDoors support mailbox for the deployment.
- App domain: `bidlow.co.uk`
- Authorized domain: `bidlow.co.uk`
- Homepage URL: `https://opensdoors.bidlow.co.uk`
- Privacy policy URL: publish and use the ODoutreach privacy policy URL under the authorized domain.
- Terms of service URL: publish and use the ODoutreach terms URL under the authorized domain, if available.
- Authorized redirect URI: `https://opensdoors.bidlow.co.uk/api/mailbox-oauth/google/callback`
- Scopes to declare: exactly the five scopes listed in "Current requested Google scopes".

## Verification demo-video script

1. Start on an ODoutreach client workspace Mailboxes page.
2. Show the mailbox row for a Google Workspace sender and the visible Google verification note.
3. Click Connect for the Google mailbox.
4. Show the Google consent screen with the requested scopes.
5. Complete consent as the mailbox owner or approved test user.
6. Return to ODoutreach and show the mailbox row changes to Connected.
7. Explain that connection does not send email or import contacts.
8. Show that ODoutreach can read replies into Activity for the connected mailbox.
9. Show a selected inbound message detail page if needed to demonstrate why readonly access is required.
10. State that ODoutreach does not delete messages, modify labels, or expose unrelated inbox browsing.

Do not show secrets, OAuth client secrets, refresh tokens, raw access tokens, or unrelated mailbox content in the video.

## Privacy policy checklist

The privacy policy should clearly state:

- What Gmail data is accessed: mailbox identity, send permission, inbox metadata/snippets, selected reply body text, send-as settings/signature.
- Why it is accessed: sending outreach, syncing replies, staff review, sender setup.
- How it is stored: provider tokens encrypted; reply data stored in ODoutreach client activity.
- Who can access it: authorized ODoutreach staff with access to the relevant client workspace.
- Data sharing: no sale, no advertising use, no unrelated third-party transfer.
- Deletion/disconnect: disconnecting a mailbox removes stored OAuth credentials; historical ODoutreach activity may remain for audit and client operations.
- Limited Use disclosure: use and transfer of Google user data complies with the Google API Services User Data Policy, including Limited Use requirements.

## Google reviewer explanation

ODoutreach is a web application used by authorized staff to manage client outreach mailboxes. Google Workspace mailbox OAuth is per mailbox row. A staff/operator starts the connection, and the Google mailbox owner or approved account completes consent. ODoutreach then sends approved outreach/reply messages through Gmail and reads replies from that connected mailbox so staff can track responses in ODoutreach Activity.

The app requests `gmail.send` because it sends messages through Gmail API. It requests `gmail.readonly` because reply sync and staff review require reading recent inbox messages, snippets, selected message bodies, and thread/message identifiers. ODoutreach does not request full Gmail access and does not permanently delete, modify, label, archive, or move Gmail messages.

Restricted-scope review and a security assessment may be required because ODoutreach stores/transmits Gmail restricted-scope data on its server.

## Emergency test-user procedure while verification is pending

1. In Google Cloud Console, keep the OAuth app in Testing until verification is complete, or ensure the affected users are explicitly allowed for testing.
2. Add only the required mailbox owners/operators as OAuth test users.
3. Ask each test user to retry Connect from ODoutreach Mailboxes.
4. Do not broaden scopes to bypass the verification block.
5. Remove temporary test users once Google verification is complete and production access works.
