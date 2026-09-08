CREATE TABLE "ClientSendingCalendar" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "weekdays" INTEGER[] NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "previousDayEndsAt" TIMESTAMP(3) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "createdByStaffUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientSendingCalendar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientSendingCalendar_hours_check" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute"),
  CONSTRAINT "ClientSendingCalendar_days_check" CHECK (cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[0,1,2,3,4,5,6]),
  CONSTRAINT "ClientSendingCalendar_transition_check" CHECK ("effectiveAt" >= "previousDayEndsAt")
);
CREATE UNIQUE INDEX "ClientSendingCalendar_clientId_effectiveAt_key" ON "ClientSendingCalendar"("clientId", "effectiveAt");
ALTER TABLE "ClientSendingCalendar" ADD CONSTRAINT "ClientSendingCalendar_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
