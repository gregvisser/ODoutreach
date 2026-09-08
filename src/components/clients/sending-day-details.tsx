export type SendingDayDetailsValue = {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  pausedUntil: string | null;
};

export function SendingDayDetails({ day }: { day: SendingDayDetailsValue }) {
  const format = (iso: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: day.timeZone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(iso));
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>Daily allowance timezone: <strong>{day.timeZone}</strong>. Current day starts {format(day.startsAt)}; allowance resets {format(day.endsAt)}.</p>
      <p>Usage includes sent emails and reserved slots. Warm-up and scheduled batches may allow fewer outreach emails right now.</p>
      {day.pausedUntil ? <p>Outreach is paused until this allowance resets while the new calendar takes effect. Staff replies can use any remaining allowance.</p> : null}
    </div>
  );
}
