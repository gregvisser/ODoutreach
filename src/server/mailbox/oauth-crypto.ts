import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import type { MailboxProvider } from "@/generated/prisma/enums";

export type StoredMailboxCredentialV1 = {
  v: 1;
  provider: MailboxProvider;
  refreshToken: string;
  accessToken: string | null;
  /** epoch ms */
  accessTokenExpiresAt: number | null;
  scope: string | null;
};

function keyBytes(): Buffer {
  const raw =
    process.env.MAILBOX_OAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!raw) {
    throw new Error(
      "MAILBOX_OAUTH_SECRET (or AUTH_SECRET) must be set to store mailbox OAuth credentials.",
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

const IV_LEN = 12;

export function encryptMailboxCredentialJson(payload: StoredMailboxCredentialV1): string {
  const key = keyBytes();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptMailboxCredentialJson(blob: string): StoredMailboxCredentialV1 {
  const key = keyBytes();
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + 16);
  const enc = raw.subarray(IV_LEN + 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plain) as StoredMailboxCredentialV1;
  if (parsed.v !== 1) {
    throw new Error("Unsupported mailbox credential version");
  }
  return parsed;
}
