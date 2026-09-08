import type { SendingCalendar } from "./sending-calendar";

export type CalendarSettingsSnapshot = {
  current: SendingCalendar | null;
  pending: (SendingCalendar & { effectiveAt: string; pauseStartsAt: string }) | null;
};
