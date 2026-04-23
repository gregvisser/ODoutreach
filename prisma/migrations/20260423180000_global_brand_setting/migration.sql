-- Additive migration: add `GlobalBrandSetting` singleton for admin-editable
-- global branding (favicon, centered app logo, brand/product name, alt text).
-- Every column is nullable; the UI falls back to static defaults when a
-- column is NULL. No data is written here — the first upsert (id = 'global')
-- happens the first time an admin saves the Settings → Branding form.

CREATE TABLE "GlobalBrandSetting" (
    "id" TEXT NOT NULL,
    "appLogoUrl" TEXT,
    "appMarkUrl" TEXT,
    "appFaviconUrl" TEXT,
    "appBrandName" TEXT,
    "appProductName" TEXT,
    "appLogoAltText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "GlobalBrandSetting_pkey" PRIMARY KEY ("id")
);
