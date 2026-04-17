import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import type { NextAuthConfig } from "next-auth";

import { getTenantIdFromEntraIssuer } from "@/lib/entra-tenant";

export { getTenantIdFromEntraIssuer };

/** OIDC issuer must not end with `/` — avoids `.../v2.0//.well-known` and discovery issues. */
function normalizeEntraIssuer(issuer: string | undefined): string | undefined {
  if (!issuer) return undefined;
  return issuer.trim().replace(/\/+$/, "");
}

/**
 * Microsoft Entra ID (Azure AD) — staff SSO. MFA is enforced in Entra, not in this app.
 *
 * Env (see .env.example):
 * - AUTH_MICROSOFT_ENTRA_ID_ID, AUTH_MICROSOFT_ENTRA_ID_SECRET
 * - AUTH_MICROSOFT_ENTRA_ID_ISSUER (single-tenant: https://login.microsoftonline.com/<tenant-id>/v2.0/)
 * - AUTH_SECRET, AUTH_URL (local: http://localhost:3000)
 */
const entraIssuer = normalizeEntraIssuer(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);

const config = {
  secret: process.env.AUTH_SECRET,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: entraIssuer,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const expected = getTenantIdFromEntraIssuer(entraIssuer);
      if (!expected || !profile) return true;
      const tid = (profile as { tid?: string }).tid;
      if (!tid) return true;
      return tid.toLowerCase() === expected;
    },
    async jwt({ token, profile }) {
      if (profile) {
        const p = profile as {
          oid?: string;
          preferred_username?: string;
          email?: string;
        };
        token.oid = p.oid;
        if (p.preferred_username) token.email = p.preferred_username;
        else if (p.email) token.email = p.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const oid = token.oid as string | undefined;
        session.user.id = oid ?? (token.sub as string);
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
  trustHost: true,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);
