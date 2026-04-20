-- Additive (PR D1): ContactList + ContactListMember tables.
-- Bridge toward universal contacts + named email lists
-- (docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md §0, §5 PR D1).
--
-- Safety:
--   * No existing columns are altered; no rows are touched.
--   * Contact.clientId remains required and unchanged.
--   * @@unique([clientId, email]) on Contact is unchanged.
--   * No reads/writes from app code yet — PR D2 starts populating rows.

CREATE TABLE "ContactList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clientId" TEXT,
    "createdByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactList_clientId_idx" ON "ContactList"("clientId");
CREATE INDEX "ContactList_name_idx" ON "ContactList"("name");
CREATE INDEX "ContactList_createdByStaffUserId_idx" ON "ContactList"("createdByStaffUserId");

ALTER TABLE "ContactList"
    ADD CONSTRAINT "ContactList_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContactList"
    ADD CONSTRAINT "ContactList_createdByStaffUserId_fkey"
    FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ContactListMember" (
    "id" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedByStaffUserId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactListMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactListMember_contactListId_contactId_key"
    ON "ContactListMember"("contactListId", "contactId");
CREATE INDEX "ContactListMember_contactId_idx" ON "ContactListMember"("contactId");
CREATE INDEX "ContactListMember_addedByStaffUserId_idx"
    ON "ContactListMember"("addedByStaffUserId");

ALTER TABLE "ContactListMember"
    ADD CONSTRAINT "ContactListMember_contactListId_fkey"
    FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactListMember"
    ADD CONSTRAINT "ContactListMember_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactListMember"
    ADD CONSTRAINT "ContactListMember_addedByStaffUserId_fkey"
    FOREIGN KEY ("addedByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
