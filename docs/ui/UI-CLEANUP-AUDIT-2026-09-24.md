# UI cleanup audit — 24 September 2026

Staff and client app. Production: https://opensdoors.bidlow.co.uk.

This pass fixes shared layout and components first, then the pages that were rendering every client as a chip.

| Route | Copy | AI icon | Responsive | Long lists | Sticky | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| `/reporting` | Subtitle was developer language (“rollup tables”, “accessible workspaces”). Breakdown said “filter chips” and “send-proof”. | None | Client chips wrapped the full phone screen before any figures. Wide table. | Every client rendered as a button. | Header scrolled away. | Plain subtitle. Shared `ClientPicker` keeps `?client=` and the date range. Breakdown uses the shared scrolling table. Title and picker sit in `StickyFilterBar` from tablet up. |
| `/reporting/detail` | Back link and metric labels already plain. | None | Inherits page padding and button height. | No client chip row. | Inherits app header. | No separate control. Date and client still come from the query string. |
| `/replies` | “client workspace” and “read by the assistant”. | Classification badges had no sparkles. | Table already scrolls. | No client chip row. | Inherits app header and sticky table head. | Copy tightened. Classified rows use `AiClassificationBadge`. |
| `/clients` | Directory copy was already staff-facing. | None | Table scrolls inside a max height. | The directory is the client list itself, not a filter. | Table head sticks inside the table region. | Shared table and button sizes. |
| `/clients/new` | Heading already “Add a client”. | None | Form stacks. | None | App header. | Shared input and button height. |
| `/clients/[id]` and tabs | Subnav labels are already the agreed names (Lists, Do-not-contact, Setup help). | None | Eleven tabs wrapped and ate the phone screen. | Fixed set of tabs, not an unbounded client list. They stay as tabs and scroll sideways on a phone. | Subnav sticks under the header from tablet up, and scrolls away on a phone. | `ClientWorkspaceSubnav`. |
| `/clients/[id]/templates` | “Draft emails with AI” kept. Unconfigured copy no longer says “API key” or “this environment”. | Section and buttons had no sparkles. | Details blocks stack. | None | Subnav. | `AiBadge` on the section, the card and the button. |
| `/clients/[id]/outreach` | AI card copy kept its meaning. Unconfigured sentence simplified. | Send-time, campaign review and job-title cards had no sparkles. | Cards stack. | None | Subnav. | `AiBadge` on each title and action. |
| `/clients/[id]/mailboxes` | Sender-comparison copy kept. | “Compare our senders with AI” had no sparkles. | Existing panels. | None | Subnav. | `AiBadge`. |
| `/universe` | “Job1 Title” and “A Emails”. Success text said “materialized”. | None | Wide table already scrolls. | Client field was a non-searchable select of every client. | Table head sticks in the scroll region. | Searchable `ClientPicker`. Sort labels in plain English. |
| `/contacts` (administrator) | “legacy tools”, “in scope”, “workspace”. | None | Chip row wrapped the screen. | Every client was a chip. | Filter bar sticks from tablet up. | `ClientPicker`. Search is still kept when the client changes. Page offset resets. |
| `/suppression` | Intro said “queueing”. Chip label was only “All”. | None | Chip row wrapped the screen. | Every client was a chip. | Filter bar sticks from tablet up. | `ClientPicker` with “All accessible clients”. `?client=` unchanged. Do-not-contact status wording, including “List held — sending continues”, is untouched. |
| `/activity` (administrator) | “legacy view”, “debug”, “operational log”. | Reply classification badges had no sparkles on the client Activity tab. | Chip row and two wide tables. | Every client was a chip. | Filter bar and table heads. | `ClientPicker`. Classified replies use `AiClassificationBadge`. |
| `/operations/outbound` | “All in scope”, “Ops”, “Effective From (preview)”. | None | Chip row. | Every client was a chip. | Filter bar. | `ClientPicker`. Column renamed “From address”. |
| `/support` | “Tickets”, “ODoutreach”, “the developer”. | No product AI call on this page. | Form stacks. | None | App header. | Heading “Support requests” and a plain description. |
| `/settings` and `/settings/ai-spend` | Spend page named environment variables. | Spend is an AI section and had no sparkles. | Month links are a short fixed set and stay as links. Tables scroll. | None | App header and table head. | `AiBadge` on the headings. Banners no longer name setting keys. |
| `/training` and header search | How-do-I search is the training assistant. | Search button used a magnifying glass. | The label hid on a narrow header so the icon and Sign out fit. | None | App header already sticky. | `AiIcon` on the button and the sheet title. |
| `/google-reconnects` | Already plain. | None | Summary cards and table. | None | Table head. | Shared table and button sizes. |
| `/sign-in` | “operations” and “Microsoft Entra ID”. | None | Card is `max-w-md` with page padding. | None | Not an app-shell page. | “Sign in with your Microsoft work account.” |
| Auth gates, privacy, terms, unsubscribe | Legal and access copy left as written. | None | Existing shells. | None | None | No change. Safety and do-not-contact behaviour unchanged. |

## Shared pieces

- `ClientPicker` (`src/components/clients/client-picker.tsx`) — one searchable list. `hrefFor` keeps each page’s query string. `onValueChange` covers forms.
- `AiIcon`, `AiBadge`, `AiClassificationBadge` (`src/components/ai/ai-badge.tsx`) — Lucide `Sparkles`, `text-primary`, `aria-label="AI"`.
- `StickyFilterBar` — sticks under the 4rem header from the `md` breakpoint up. On a phone it scrolls with the page.
- Buttons, inputs and icon buttons are at least 44px. Tables scroll inside `max-h-[min(70vh,40rem)]` with a sticky header. Sheets cap at the viewport. The app column uses `overflow-x-clip`.
- “New client” in the menu uses `UserPlus`. Sparkles is reserved for AI.

## Screenshots

Authenticated pages need a database and a Microsoft sign-in, and neither was available in this run. These captures are from the production build on this machine.

- Before, from the phone report: `/opt/cursor/artifacts/screenshots/reports-before-phone.jpg`
- Sign-in after, 390 / 820 / 1440: `/opt/cursor/artifacts/screenshots/sign-in-390.png`, `sign-in-820.png`, `sign-in-1440.png`
- Privacy (unchanged copy, layout check): `privacy-390.png`, `privacy-820.png`, `privacy-1440.png`
- `/reporting` while signed out redirects to sign-in and keeps `callbackUrl`: `reporting-signed-out-390.png` and the 820 and 1440 pairs

## Left as they are

- Sending, scheduling, do-not-contact rules, readiness, open tracking, auth and the data model.
- “Human sending” as the name of the non-automatic sending mode.
- The approved do-not-contact line “List held — sending continues”.
- Short fixed choices (date presets, month links, sort options, workspace tabs) stay as controls or a sideways-scrolling tab row.
- Taxonomy chips on the brief are a fixed vocabulary, not a list of clients.
