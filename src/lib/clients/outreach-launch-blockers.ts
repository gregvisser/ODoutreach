import type { SequenceLaunchCheckResult } from "@/lib/email-sequences/launch-readiness";

/**
 * Turns failing readiness checks into short staff-facing bullets for Outreach.
 */
export function staffLaunchBlockerLines(
  checks: readonly SequenceLaunchCheckResult[],
): string[] {
  const lines: string[] = [];
  for (const check of checks) {
    if (check.status !== "fail") continue;
    switch (check.id) {
      case "sequence_exists":
        lines.push("This sequence could not be loaded — refresh and try again.");
        break;
      case "sequence_approved":
        lines.push("This sequence is archived — restore it before going live.");
        break;
      case "contact_list_attached":
        lines.push("Select a contact list.");
        break;
      case "introduction_template_approved":
        lines.push("Add at least one introduction email step.");
        break;
      case "all_step_templates_approved":
        lines.push("Fix email steps (one or more use archived templates).");
        break;
      case "unsubscribe_placeholder_present":
        lines.push("Unsubscribe link is missing from the introduction.");
        break;
      case "enrollment_records_exist":
        lines.push("Add eligible recipients — save the sequence or tap Review recipients.");
        break;
      case "pending_email_sendable_recipients":
        lines.push(check.detail);
        break;
      case "connected_sending_mailbox":
        lines.push("Connect a sending mailbox or pick an eligible mailbox.");
        break;
      case "daily_capacity_available":
        lines.push("Daily mailbox send limit is reached for today.");
        break;
      case "sequence_not_launched":
        lines.push("This sequence has already started sending.");
        break;
      default:
        lines.push(`${check.label}: ${check.detail}`);
    }
  }
  return lines;
}
