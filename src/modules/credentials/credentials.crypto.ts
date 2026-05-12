import crypto from "node:crypto";

function deriveKey(encryptionKey: string): Buffer {
  return crypto.createHash("sha256").update(encryptionKey, "utf8").digest();
}

export function encryptConnectionString(connectionString: string, encryptionKey: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(encryptionKey);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(connectionString, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([ciphertext, tag]);
  return { encrypted: combined.toString("base64url"), iv: iv.toString("base64url") };
}

export function decryptConnectionString(encryptedBase64Url: string, ivBase64Url: string, encryptionKey: string): string {
  const iv = Buffer.from(ivBase64Url, "base64url");
  const combined = Buffer.from(encryptedBase64Url, "base64url");
  if (combined.length < 17) throw new Error("Invalid encrypted payload");
  const ciphertext = combined.subarray(0, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);
  const key = deriveKey(encryptionKey);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

