-- One staff row per email; enables safe first-login link by email → persist entraObjectId

UPDATE "StaffUser" SET "email" = LOWER(TRIM("email"));

CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");
