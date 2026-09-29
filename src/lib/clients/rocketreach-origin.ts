const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function londonDate(on: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/London",
  }).formatToParts(on);
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} ${MONTHS[month - 1] ?? "Jan"} ${year}`;
}

/** One-line UK GDPR source notice for a person copied from this client's own Universe row. */
export function universeHarvestOrigin(on: Date): string {
  return `Re-harvested from Universe on ${londonDate(on)}`;
}

/** One-line UK GDPR source notice. Plan names cannot add a second line. */
export function automaticSourceOrigin(planName: string, on: Date): string {
  const name = planName.replace(/\s+/g, " ").trim().slice(0, 120);
  return `Sourced automatically from plan ${name} on ${londonDate(on)}`;
}
