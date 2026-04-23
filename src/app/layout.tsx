import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SessionProvider } from "@/components/providers/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getGlobalBrand } from "@/server/branding/get-global-brand";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadata is generated per-request so the admin-saved favicon, brand
 * name, and product name flow into the `<head>` immediately after a
 * save. When no custom values are stored, `getGlobalBrand()` returns
 * the shipped OpensDoors defaults (identical to the previous static
 * behaviour), so the page remains fully branded in the empty state.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getGlobalBrand();
  return {
    title: {
      default: `${brand.brandName} ${brand.productName}`,
      template: `%s · ${brand.brandName}`,
    },
    description:
      "Cold outreach operations — multi-tenant, suppression-aware, reply-tracked.",
    icons: {
      icon: [{ url: brand.faviconUrl }],
      shortcut: [{ url: brand.faviconUrl }],
      apple: [{ url: brand.faviconUrl }],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans">
        <SessionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
