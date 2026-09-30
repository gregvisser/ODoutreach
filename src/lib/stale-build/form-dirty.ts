type FormFieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isFormField(element: Element): element is FormFieldElement {
  if (typeof HTMLInputElement !== "undefined") {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    );
  }
  const tag = element.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isInputField(field: FormFieldElement): field is HTMLInputElement {
  if (typeof HTMLInputElement !== "undefined" && field instanceof HTMLInputElement) {
    return true;
  }
  return "type" in field && !("rows" in field);
}

function isSelectField(field: FormFieldElement): field is HTMLSelectElement {
  if (typeof HTMLSelectElement !== "undefined" && field instanceof HTMLSelectElement) {
    return true;
  }
  return "selectedIndex" in field && "options" in field;
}

export function isFormFieldDirty(field: FormFieldElement): boolean {
  if (isInputField(field)) {
    if (field.type === "checkbox" || field.type === "radio") {
      return field.checked !== field.defaultChecked;
    }
    if (field.type === "file") {
      return field.files != null && field.files.length > 0;
    }
    return field.value !== field.defaultValue;
  }
  if (isSelectField(field)) {
    for (let index = 0; index < field.options.length; index += 1) {
      const option = field.options[index];
      if (option.selected !== option.defaultSelected) return true;
    }
    return false;
  }
  return field.value !== field.defaultValue;
}

/** True when any visible form on the page has user-edited fields. */
export function hasDirtyForm(documentRoot: Document): boolean {
  const forms = documentRoot.querySelectorAll("form");
  for (const form of forms) {
    const fields = form.querySelectorAll("input, textarea, select");
    for (const field of fields) {
      if (!isFormField(field)) continue;
      if (field.disabled) continue;
      if ("readOnly" in field && field.readOnly) continue;
      if (isInputField(field) && field.type === "hidden") continue;
      if (isFormFieldDirty(field)) return true;
    }
  }
  return false;
}

export function confirmReloadWithDirtyForms(documentRoot: Document): boolean {
  if (!hasDirtyForm(documentRoot)) return true;
  return window.confirm(
    "You have unsaved changes on this page. Reload anyway? Unsaved edits will be lost.",
  );
}

export { isFormField };
