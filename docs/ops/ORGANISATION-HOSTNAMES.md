# Organisation hostnames

Each organisation can have one public hostname, saved by a platform administrator on `/platform/<organisation id>`. The app resolves that host to the organisation for branding and for mailbox OAuth return URLs. Data access stays the staff member's organisation membership. A hostname does not grant access to another organisation's clients.

`opensdoors.bidlow.co.uk` is OpensDoors in code. Saving that host on another organisation is refused. A row that claims it is ignored. Clearing a hostname, an unknown host, `localhost`, and the Azure default `*.azurewebsites.net` host all resolve to OpensDoors. That fallback is what keeps the existing site working when a hostname has not been saved or DNS is not ready. Do not remove the OpensDoors custom domain, its DNS records, or its Entra and mailbox redirect URIs.

`AUTH_URL` stays the OpensDoors origin. NextAuth already trusts the request host (`trustHost`), so sign-in can finish on the host that started it. The Entra app registration still has to list each host. A forged `Host` header is not used as an OAuth redirect; the redirect falls back to `AUTH_URL`.

Logos that an organisation has not uploaded still use the shipped OpensDoors artwork. The name in the shell uses the organisation name until a brand name is saved in settings. On `opensdoors.bidlow.co.uk` the brand is unchanged: organisation fields, then the existing global brand row, then the shipped defaults.

Migration `20261001190000_organisation_hostname` adds a nullable unique `hostname` column and sets OpensDoors to `opensdoors.bidlow.co.uk` when the column is still empty. It is additive and idempotent. Production applies it on deploy because `PRODUCTION_PRISMA_MIGRATE` is true, and the migrate step runs before the Azure deploy. Confirm the deploy log contains `Applying migration 20261001190000_organisation_hostname`. Code that cannot read the column yet falls back to OpensDoors.

## What Greg does for a new hostname

Do this before saving the hostname in `/platform`. Until DNS and the certificate work, leave the field blank so the organisation keeps using the OpensDoors host.

1. Leave `opensdoors.bidlow.co.uk` on the App Service. Do not delete that custom domain, its certificate binding, or its DNS.
2. In the App Service (`app-opensdoors-outreach-prod`, resource group `rg-opensdoors-outreach-prod`), add a custom domain for the new host, for example `northwind.bidlow.co.uk`.
3. In DNS, add the verification TXT record Azure shows (`asuid.<host>`) and a CNAME from the new host to the App Service default hostname. Do not point the new host at a different app.
4. Bind an App Service Managed Certificate (or an existing certificate that covers the host) and turn on HTTPS Only for that binding. SNI is the right binding when several hostnames share the app.
5. In the Entra app registration used for staff sign-in, add a redirect URI:
   `https://<host>/api/auth/callback/microsoft-entra-id`
   Keep the existing OpensDoors redirect URI.
6. In the Microsoft mailbox OAuth app registration, add:
   `https://<host>/api/mailbox-oauth/microsoft/callback`
   Keep the OpensDoors mailbox redirect URI. The tenant admin-consent link still uses `AUTH_URL` (the OpensDoors origin). That link is not per organisation.
7. In the Google Cloud OAuth client used for mailbox connect, add the same shape of redirect:
   `https://<host>/api/mailbox-oauth/google/callback`
   Keep the OpensDoors Google redirect URI.
8. Open `https://<host>` and confirm the certificate is valid and the sign-in page loads. Then, as a platform administrator, save the hostname on that organisation's page under `/platform`. After it is saved, that host shows the organisation name (and its logo, once one is uploaded) and mailbox connect returns to that host.

`localhost` is for development only. Do not save it as an organisation hostname.
