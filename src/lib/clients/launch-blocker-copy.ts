/**
 * Friendly, operator-facing copy for the launch-approval blockers produced by
 * `evaluateClientLaunchApproval`. The overview "Not live yet" card renders
 * these so an operator sees EXACTLY what's left before a client auto-activates
 * — including the requirements that aren't visible as setup sections (a sender
 * signature, a synced suppression sheet, an eligible contact).
 *
 * Pure: no React, no Prisma. The raw blocker strings are the single source of
 * truth (the activation gate); this only translates them to plain English + a
 * "go fix it" link target.
 */

export type LaunchBlockerHint = {
  /** Plain-English line shown to the operator. */
  text: string;
  /** Path suffix under `/clients/{id}` to fix it, e.g. `/mailboxes`. */
  hrefSuffix?: string;
  /** Button/link label for the fix-it target. */
  actionLabel?: string;
};

/**
 * Map one raw policy blocker string to friendly copy + a link. Unrecognised
 * strings pass through verbatim so a new blocker is never hidden.
 */
export function humanizeLaunchBlocker(raw: string): LaunchBlockerHint {
  const s = raw.trim();
  const l = s.toLowerCase();

  if (l.includes("business brief")) {
    return { text: "Finish the business brief.", hrefSuffix: "/brief", actionLabel: "Open brief" };
  }
  if (l.includes("sender signature")) {
    return {
      text: "Add a signature to a connected mailbox — every send needs one.",
      hrefSuffix: "/mailboxes",
      actionLabel: "Open mailboxes",
    };
  }
  if (
    l.includes("sending mailbox is connected") ||
    l.includes("launch readiness blocker: mailboxes")
  ) {
    return {
      text: "Connect at least one sending mailbox.",
      hrefSuffix: "/mailboxes",
      actionLabel: "Open mailboxes",
    };
  }
  if (l.includes("suppression is not configured")) {
    return {
      text: "Attach the client's suppression Google Sheet.",
      hrefSuffix: "/suppression",
      actionLabel: "Open suppression",
    };
  }
  if (l.includes("launch readiness blocker: suppression")) {
    return {
      text: "Finish suppression — attach the sheet and let it sync.",
      hrefSuffix: "/suppression",
      actionLabel: "Open suppression",
    };
  }
  if (l.includes("no contacts are loaded")) {
    return {
      text: "Import contacts into an email list.",
      hrefSuffix: "/contacts",
      actionLabel: "Open contacts",
    };
  }
  if (l.includes("launch readiness blocker: contacts")) {
    return {
      text: "Add at least one eligible (non-suppressed) contact with an email address.",
      hrefSuffix: "/contacts",
      actionLabel: "Open contacts",
    };
  }
  if (l.includes("launchable production sequence")) {
    return {
      text: "Set up a launchable sequence — an introduction step with an active template.",
      hrefSuffix: "/outreach",
      actionLabel: "Open outreach",
    };
  }
  if (l.includes("sequence enrollments")) {
    return {
      text: "Enroll contacts into the sequence.",
      hrefSuffix: "/outreach",
      actionLabel: "Open outreach",
    };
  }
  if (l.includes("launch readiness blocker: sources")) {
    return {
      text: "Connect the contact import provider (Sources).",
      hrefSuffix: "/sources",
      actionLabel: "Open sources",
    };
  }
  if (l.includes("launch readiness blocker: outreach")) {
    return {
      text: "Finish Outreach setup so a sequence is ready to launch.",
      hrefSuffix: "/outreach",
      actionLabel: "Open outreach",
    };
  }
  if (l.includes("launch readiness blocker: brief")) {
    return { text: "Finish the business brief.", hrefSuffix: "/brief", actionLabel: "Open brief" };
  }
  if (l.includes("archived")) {
    return { text: "This client is archived and can't be launched." };
  }

  // Generic "Launch readiness blocker: X." → "Finish setup: X."
  const m = s.match(/launch readiness blocker:\s*(.+?)\.?$/i);
  if (m) {
    return { text: `Finish setup: ${m[1]}.` };
  }

  return { text: s };
}
