"use client";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  clientId: string;
  templateId: string;
  templateName: string;
  children: React.ReactNode;
};

/**
 * Row 130 — permanent delete with a single browser confirm, mirroring
 * `ArchiveSequenceConfirmForm`. Only rendered when the server has already
 * decided the template is safe to delete (see `describeTemplateDeleteEligibility`);
 * this is the last-chance safety prompt, not the eligibility check.
 */
export function TemplateDeleteConfirmForm({
  action,
  clientId,
  templateId,
  templateName,
  children,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Permanently delete "${templateName}"? This cannot be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="templateId" value={templateId} />
      {children}
    </form>
  );
}
