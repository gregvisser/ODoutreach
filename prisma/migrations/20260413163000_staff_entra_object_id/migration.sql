-- Rename Clerk external id to Microsoft Entra directory object id (oid claim)

ALTER TABLE "StaffUser" RENAME COLUMN "clerkUserId" TO "entraObjectId";

ALTER INDEX "StaffUser_clerkUserId_key" RENAME TO "StaffUser_entraObjectId_key";
