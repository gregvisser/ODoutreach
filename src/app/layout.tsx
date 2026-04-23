import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SessionProvider } from "@/components/providers/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OpensDoors Outreach",
    template: "%s · OpensDoors",
  },
  description:
    "Cold outreach operations for OpensDoors — multi-tenant, suppression-aware, reply-tracked.",
  // Favicon/app icon is handled by Next.js metadata-files convention:
  //   - `src/app/icon.svg`   → branded vector app icon (modern browsers)
  //   - `src/app/favicon.ico` → legacy .ico fallback
  // Keep those files in sync when swapping in final brand artwork.
};

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
