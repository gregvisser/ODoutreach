import type { Metadata } from "next";

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_OPERATOR_NAME,
  LegalPageShell,
  LegalPlainly,
  LegalSection,
} from "@/components/legal/legal-page-shell";

/**
 * Public terms of service. Same constraints as `/privacy`: no session, no
 * database read. Written from what the platform actually enforces in code, so
 * that the obligations named here are ones the software can be held to.
 */

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms on which customer organisations and their staff may use the OpensDoors outreach platform.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      intro="The terms on which customer organisations and their staff may use this outreach platform."
    >
      <LegalSection heading="Who these terms are for">
        <p>
          These terms apply to customer organisations that use the{" "}
          {LEGAL_OPERATOR_NAME} outreach platform, and to the individual staff
          members who sign in to it. They do not create obligations for people
          who merely receive outreach email — what those people can expect is
          set out in the{" "}
          <a className="underline hover:text-foreground" href="/privacy">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="What the platform does">
        <p>
          It manages business-to-business outreach campaigns: importing contact
          lists, composing sequences of email, sending them on a schedule from
          the customer&rsquo;s own connected mailbox, collecting replies back
          into a shared inbox, and maintaining do-not-contact and suppression
          lists.
        </p>
        <p>
          Access requires a Microsoft work account and an invitation. There is
          no self-service sign-up.
        </p>
      </LegalSection>

      <LegalSection heading="You are the sender">
        <p>
          This is the most important term here. Outreach leaves the
          customer&rsquo;s own mailbox, under the customer&rsquo;s own name and
          domain. In law and in the eyes of the recipient, the customer is the
          sender.
        </p>
        <LegalPlainly>
          <p>
            The customer is therefore responsible for having a lawful basis for
            contacting each person on their list, for the accuracy of the lists
            they upload, for the content of the messages they compose, and for
            complying with the UK GDPR and PECR. The platform provides
            unsubscribe handling, suppression checking and volume limits to make
            that compliance practical — it does not transfer the responsibility.
          </p>
        </LegalPlainly>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You must not use the platform to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Send to consumers at personal addresses where PECR consent is
            required and has not been obtained.
          </li>
          <li>
            Send anything deceptive, or misrepresent who the message is from.
          </li>
          <li>
            Contact anyone who has unsubscribed, bounced, or otherwise asked not
            to be contacted. The platform blocks these; deliberately working
            around the block is a breach of these terms.
          </li>
          <li>
            Upload contact data that the customer has no right to hold or use.
          </li>
          <li>
            Send at volumes or in patterns intended to evade the platform&rsquo;s
            sending limits, or to damage the reputation of any sending domain.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Mailbox access">
        <p>
          Connecting a mailbox grants the platform permission to send mail as
          that mailbox and to read that mailbox in order to match replies to
          outreach. The credentials are held to perform those two functions and
          nothing else. A mailbox owner can revoke access at any time from
          Microsoft or Google directly; doing so stops both sending and reply
          collection for that mailbox immediately.
        </p>
        <p>
          The platform&rsquo;s use of information received from Google APIs
          adheres to the{" "}
          <a
            className="underline hover:text-foreground"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noreferrer noopener"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection heading="Sending limits and protective controls">
        <p>
          New mailboxes are warmed up rather than used at full volume
          immediately, and daily per-mailbox caps apply. Sends are refused when
          a recipient is suppressed, when a mailbox&rsquo;s credentials have
          failed, or when the platform cannot confirm the message would leave
          through a genuine connected mailbox. These controls exist to protect
          the customer&rsquo;s sending reputation and cannot be disabled on
          request.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          The platform is provided without a guaranteed uptime commitment.
          Scheduled sending depends on third-party services — Microsoft, Google
          and the hosting platform — and an outage at any of them can delay or
          prevent sending. Queued messages are retried rather than silently
          dropped, but no delivery time is promised.
        </p>
        <p>
          Email delivery itself is never guaranteed. Whether a message reaches
          an inbox is decided by the recipient&rsquo;s mail provider, not by
          this platform or by {LEGAL_OPERATOR_NAME}.
        </p>
      </LegalSection>

      <LegalSection heading="Your data, and what happens when you leave">
        <p>
          Customer data remains the customer&rsquo;s. On termination, a
          workspace is first deactivated — which stops all sending — and then
          purged on request, which deletes its contacts, campaigns, sent email
          and replies.
        </p>
        <LegalPlainly>
          <p>
            Stated plainly: a purge does not remove records from the
            platform&rsquo;s cross-customer contact store, which is not attached
            to any single workspace. If deletion of those records is required,
            ask for it
            explicitly and it will be done manually. This limitation is
            described in more detail in the{" "}
            <a className="underline hover:text-foreground" href="/privacy">
              Privacy Policy
            </a>
            .
          </p>
        </LegalPlainly>
        <p>
          Export your data before requesting a purge. A purge is not reversible
          and there is no undelete.
        </p>
      </LegalSection>

      <LegalSection heading="Suspension">
        <p>
          Access may be suspended without notice where continued sending would
          breach these terms, damage a sending domain&rsquo;s reputation, or
          expose recipients to unlawful contact. Where suspension is not urgent,
          notice will be given first.
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          Nothing in these terms limits liability for death or personal injury
          caused by negligence, for fraud, or for anything else that cannot be
          limited in law. Subject to that, {LEGAL_OPERATOR_NAME} is not liable
          for lost profits, lost business, or damage to sending-domain
          reputation arising from the customer&rsquo;s own list quality, message
          content or sending choices.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and governing law">
        <p>
          These terms may be updated; the date at the top of this page shows
          when. Material changes will be notified to customer administrators.
          These terms are governed by the law of England and Wales.
        </p>
        <p>
          Questions go to{" "}
          <a
            className="underline hover:text-foreground"
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
