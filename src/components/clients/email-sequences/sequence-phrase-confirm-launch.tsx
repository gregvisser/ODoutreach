"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  /** Server action URL — same as form `action`. */
  formAction: string | ((formData: FormData) => void | Promise<void>);
  /** Hidden fields and any non-submit controls that belong inside the form. */
  children: React.ReactNode;
  /** Value posted as `confirmationPhrase` — must match server normalisation. */
  confirmationPhrase: string;
  modalTitle: string;
  modalBody: string;
  triggerLabel: string;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  submitButtonClassName?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  formClassName?: string;
};

/**
 * Wraps a server-action form that still requires a typed confirmation phrase on
 * the wire. Staff confirm in a modal; the phrase is injected into a hidden
 * field immediately before `requestSubmit()` — server validation unchanged.
 */
export function SequencePhraseConfirmLaunch({
  formAction,
  children,
  confirmationPhrase,
  modalTitle,
  modalBody,
  triggerLabel,
  confirmLabel = "Launch sequence",
  cancelLabel = "Cancel",
  disabled = false,
  submitButtonClassName,
  variant = "default",
  formClassName = "flex flex-wrap items-center gap-2",
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const phraseRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const [error, setError] = useState<string | null>(null);

  const openModal = () => {
    setError(null);
    dialogRef.current?.showModal();
  };

  const closeModal = () => {
    dialogRef.current?.close();
  };

  const confirm = () => {
    const form = formRef.current;
    const phraseInput = phraseRef.current;
    if (!form || !phraseInput) {
      setError("Form is not ready. Refresh the page.");
      return;
    }
    phraseInput.value = confirmationPhrase;
    form.requestSubmit();
    closeModal();
  };

  return (
    <>
      <form ref={formRef} action={formAction} className={formClassName}>
        <input
          ref={phraseRef}
          type="hidden"
          name="confirmationPhrase"
          defaultValue=""
          autoComplete="off"
        />
        {children}
        <Button
          type="button"
          size="sm"
          variant={variant}
          disabled={disabled}
          className={submitButtonClassName}
          onClick={openModal}
        >
          {triggerLabel}
        </Button>
      </form>

      <dialog
        ref={dialogRef}
        className="fixed z-50 w-[min(100%-2rem,28rem)] rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-lg backdrop:bg-black/40"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClose={() => setError(null)}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold">
            {modalTitle}
          </h2>
        </div>
        <p id={descId} className="px-4 py-3 text-sm text-muted-foreground">
          {modalBody}
        </p>
        {error ? (
          <p className="px-4 pb-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={closeModal}>
            {cancelLabel}
          </Button>
          <Button type="button" size="sm" onClick={confirm}>
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
