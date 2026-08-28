import type { Metadata } from "next";

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_OPERATOR_NAME,
  LegalPageShell,
  LegalPlainly,
  LegalSection,
} from "@/components/legal/legal-page-shell";

/**
 * Public privacy policy. No session, no database read, no brand lookup — see
 * `legal-page-shell.tsx` for why.
 *
 * Every factual claim below was taken from the code or the data model, not from
 * a template. Where the honest answer is unflattering (no retention schedule,
 * no self-service erasure, a cross-client table that survives deletion, sheet
 * suppression that can un-suppress someone) it is stated rather than omitted: a
 * privacy policy that does not match the system is worse than no policy at all,
 * because it converts a gap into a false statement.
 */

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How the OpensDoors outreach platform handles personal data, including data belonging to people who receive outreach.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      intro="How this outreach platform handles personal data — both for the staff who use it and for the people who receive email through it."
    >
      <LegalSection heading="Who this covers">
        <p>
          {LEGAL_OPERATOR_NAME} operates a cold-outreach platform used by
          customer organisations to run email campaigns to business contacts.
          This policy covers two very different groups of people:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Platform users</strong> — staff
            at {LEGAL_OPERATOR_NAME} and at customer organisations who sign in
            to the application.
          </li>
          <li>
            <strong className="text-foreground">Recipients</strong> — the
            business contacts who receive outreach email. You did not sign up
            for anything, and you are the reason most of this document exists.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="If you received an email and want it to stop">
        <p>
          Every outreach email contains an unsubscribe link. Using it takes
          effect immediately and permanently for that sender — the record is
          added to a suppression list that the system checks twice before any
          later send, once when the message is queued and again at the moment of
          dispatch. You can also simply reply and ask; replies are read by a
          person.
        </p>
        <LegalPlainly>
          <p className="font-semibold">Stated plainly:</p>
          <p className="mt-2">
            Suppression is <strong>per customer, not platform-wide</strong>.
            Unsubscribing from one organisation&rsquo;s outreach does not stop a
            different organisation that also uses this platform from contacting
            you. If you want to be removed everywhere, email{" "}
            <span className="font-mono">{LEGAL_CONTACT_EMAIL}</span> and say so
            explicitly.
          </p>
        </LegalPlainly>
      </LegalSection>

      <LegalSection heading="What we hold about a recipient">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Business contact details: name, work email address, employer, job
            title, and where supplied, work phone number and LinkedIn profile
            URL.
          </li>
          <li>
            The full content of every email sent to you through the platform. A
            copy of the body is stored, not just a record that a message was
            sent.
          </li>
          <li>
            The full text of any reply you send back, retrieved from the
            sender&rsquo;s mailbox so that it can be shown to the sender&rsquo;s
            team in the application.
          </li>
          <li>
            Delivery events: whether the message was delivered, bounced, or was
            blocked before sending.
          </li>
          <li>
            The time an email was first opened, if open tracking is enabled —
            see below.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Where the data came from">
        <p>
          We do not collect it from you directly. It reaches the platform in one
          of three ways: uploaded by the customer organisation from their own
          records, synchronised from a Google Sheet that the customer maintains,
          or imported from <strong className="text-foreground">RocketReach</strong>,
          a third-party business-contact data provider. If you want to know
          which route applied to you, ask and we will tell you.
        </p>
      </LegalSection>

      <LegalSection heading="How email is sent, and by whom">
        <p>
          Outreach is sent{" "}
          <strong className="text-foreground">
            from the customer&rsquo;s own mailbox, as the customer
          </strong>{" "}
          — through Microsoft 365 or Google Workspace, using credentials that
          the mailbox owner granted. It does not pass through a bulk-email
          service and it does not come from a {LEGAL_OPERATOR_NAME} address. The
          reply you send goes back to the person who wrote to you.
        </p>
      </LegalSection>

      <LegalSection heading="Open tracking">
        <p>
          Outreach email may contain a hidden 1×1 pixel image. When a mail
          client loads images, the platform records{" "}
          <strong className="text-foreground">
            a single timestamp of the first open, and nothing else
          </strong>
          . It does not record your IP address, your location, your device or
          your mail client. Repeated opens are not counted.
        </p>
        <p>
          Open tracking is on by default and can be switched off per
          deployment. Blocking remote images in your mail client prevents it
          entirely.
        </p>
      </LegalSection>

      <LegalSection heading="Who else sees the data">
        <p>
          The platform passes personal data to the following processors, each
          for a single stated purpose:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Microsoft (Graph / 365)</strong>{" "}
            — sending outreach from, and reading replies in, a customer&rsquo;s
            Microsoft mailbox.
          </li>
          <li>
            <strong className="text-foreground">
              Google (Workspace / Gmail)
            </strong>{" "}
            — the same, for customers on Google mailboxes.
          </li>
          <li>
            <strong className="text-foreground">Google Sheets</strong> —
            reading customer-maintained contact and do-not-contact lists.
          </li>
          <li>
            <strong className="text-foreground">RocketReach</strong> — sourcing
            business contact details.
          </li>
          <li>
            <strong className="text-foreground">Resend</strong> — a transactional
            email provider, configured for system and notification mail.
            Outreach to recipients does not go through it; a guard in the code
            refuses to dispatch a prospect-bound message through this route.
          </li>
          <li>
            <strong className="text-foreground">Sentry</strong> — error
            monitoring. Receives technical diagnostics when something fails,
            which can incidentally include identifiers present in the failing
            operation.
          </li>
          <li>
            <strong className="text-foreground">Microsoft Azure</strong> —
            hosting for the application and its database.
          </li>
        </ul>
        <p>
          Data is not sold, and it is not shared between customer
          organisations for outreach purposes — with the single exception
          described in the next section.
        </p>
      </LegalSection>

      <LegalSection heading="Retention, deletion, and what we cannot yet promise">
        <p>
          This is the part most policies gloss. The accurate position today is
          as follows.
        </p>
        <LegalPlainly>
          <p className="font-semibold">
            There is no automatic retention or deletion schedule.
          </p>
          <p className="mt-2">
            Contact records, sent email bodies and replies are kept
            indefinitely. They are removed when a customer&rsquo;s entire
            workspace is purged, which is a deliberate manual administrative
            action and the only routine deletion event in the system. Nothing
            expires on a calendar.
          </p>
        </LegalPlainly>
        <LegalPlainly>
          <p className="font-semibold">
            A shared contact table survives workspace deletion.
          </p>
          <p className="mt-2">
            The platform keeps a cross-customer store of sourced business
            contacts, used for de-duplication. It is not attached to any one
            customer, so purging the workspace that originally held your record
            does not remove your name, email address, phone number or LinkedIn
            URL from that store. This is a known gap, recorded as a gap and not
            as a design decision. An erasure request under &ldquo;Your
            rights&rdquo; below is handled manually and does cover it.
          </p>
        </LegalPlainly>
        <LegalPlainly>
          <p className="font-semibold">
            One route to suppression can be undone by accident.
          </p>
          <p className="mt-2">
            Suppressions created by an unsubscribe or by a hard bounce are
            append-only and cannot be reversed. But a customer may also maintain
            their do-not-contact list in a Google Sheet, and that route replaces
            the list on each synchronisation — so if a row is deleted from that
            sheet, that address becomes contactable again. If you have opted out
            and want certainty, use the unsubscribe link or email us, rather
            than relying on the sender&rsquo;s spreadsheet.
          </p>
        </LegalPlainly>
        <p>
          There is no self-service deletion page for recipients. Erasure is
          performed by a person in response to a request.
        </p>
      </LegalSection>

      <LegalSection heading="Legal basis">
        <p>
          Outreach is business-to-business, sent to people in a professional
          capacity at their work address, and relies on legitimate interests
          under the UK GDPR. That basis depends on the balance between the
          sender&rsquo;s interest and your rights — which is why an objection
          from you ends the processing rather than starting a negotiation.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Under the UK GDPR you may ask for a copy of the personal data held
          about you, ask for it to be corrected, ask for it to be erased, or
          object to it being processed for direct marketing. An objection to
          direct marketing is absolute: there is no balancing test and we must
          stop.
        </p>
        <p>
          Send any of these to{" "}
          <a
            className="underline hover:text-foreground"
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          . If you are unhappy with the response you can complain to the UK
          Information Commissioner&rsquo;s Office at ico.org.uk.
        </p>
      </LegalSection>

      <LegalSection heading="Google user data">
        <p>
          When a customer connects a Google Workspace mailbox, the platform
          requests permission to send mail as that mailbox and to read that
          mailbox in order to match incoming replies to outreach that was sent.
          That access is used for those two purposes only.
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
          , including the Limited Use requirements. Google mailbox data is not
          used for advertising, is not sold, and is not used to train
          generalised artificial-intelligence models. It is accessible to humans
          only where a user of the customer&rsquo;s own team is reading their
          own replies in the application, where we have the user&rsquo;s
          explicit consent for a specific support issue, or where required by
          law.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy, or about data held about you, go to{" "}
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
