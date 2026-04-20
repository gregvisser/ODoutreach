-- Additive (PR D1): ContactList + ContactListMember tables.
-- Bridge toward universal contacts + named email lists
-- (docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md §0, §5 PR D1).
--
-- Safety:
--   * No existing columns are altered; no rows are touched.
--   * Contact.clientId remains required and unchanged.
--   * @@unique([clientId, email]) on Contact is unchanged.
--   * No reads/writes from app code yet — PR D2 starts populating rows.
--
-- Tenant-isolation (critical):
--   ContactListMember.clientId is required (NOT NULL) and denormalized
--   from the row's Contact.clientId. A BEFORE INSERT OR UPDATE trigger
--   (ContactListMember_client_scope_guard) enforces:
--     * NEW.clientId = Contact.clientId for NEW.contactId
--     * If ContactList.clientId IS NOT NULL, it must equal NEW.clientId
--       — a client-scoped list can only hold same-client contacts.
--     * Global lists (ContactList.clientId IS NULL) may hold contacts
--       from any client, but each row still pins the contact's client
--       scope via NEW.clientId.

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
    "clientId" TEXT NOT NULL,
    "addedByStaffUserId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactListMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactListMember_contactListId_contactId_key"
    ON "ContactListMember"("contactListId", "contactId");
CREATE INDEX "ContactListMember_contactId_idx" ON "ContactListMember"("contactId");
CREATE INDEX "ContactListMember_clientId_idx" ON "ContactListMember"("clientId");
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
    ADD CONSTRAINT "ContactListMember_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactListMember"
    ADD CONSTRAINT "ContactListMember_addedByStaffUserId_fkey"
    FOREIGN KEY ("addedByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-isolation trigger: enforces that every ContactListMember row
-- stays consistent with Contact.clientId and (when set) ContactList.clientId.
-- SQL CHECK constraints cannot query other tables, so this is the only
-- robust enforcement option at the DB layer.
CREATE OR REPLACE FUNCTION "enforce_contact_list_member_client_scope"()
RETURNS trigger AS $$
DECLARE
  list_client_id TEXT;
  contact_client_id TEXT;
BEGIN
  SELECT "clientId" INTO list_client_id
  FROM "ContactList"
  WHERE "id" = NEW."contactListId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ContactList % not found', NEW."contactListId";
  END IF;

  SELECT "clientId" INTO contact_client_id
  FROM "Contact"
  WHERE "id" = NEW."contactId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found', NEW."contactId";
  END IF;

  IF NEW."clientId" <> contact_client_id THEN
    RAISE EXCEPTION
      'ContactListMember clientId % does not match Contact.clientId % for contact %',
      NEW."clientId", contact_client_id, NEW."contactId";
  END IF;

  IF list_client_id IS NOT NULL AND list_client_id <> NEW."clientId" THEN
    RAISE EXCEPTION
      'ContactListMember clientId % does not match ContactList.clientId % for list %',
      NEW."clientId", list_client_id, NEW."contactListId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContactListMember_client_scope_guard"
BEFORE INSERT OR UPDATE ON "ContactListMember"
FOR EACH ROW
EXECUTE FUNCTION "enforce_contact_list_member_client_scope"();
