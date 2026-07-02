import type { MetadataRoute } from "next";

// Web App Manifest for PWA install. Kept static (no per-request branding) so the
// install metadata and icon URLs are stable — Next injects the
// <link rel="manifest"> automatically from this route.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpensDoors ODoutreach",
    short_name: "ODoutreach",
    description:
      "Cold outreach operations — multi-tenant, suppression-aware, reply-tracked.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#689888",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
