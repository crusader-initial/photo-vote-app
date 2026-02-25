import crypto from "crypto";

const ITERATIONS = 100000;
const KEY_LEN = 64;
const SALT_LEN = 16;
const DIGEST = "sha256";

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(SALT_LEN).toString("hex");
  const hash = crypto.pbkdf2Sync(plainPassword, salt, ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plainPassword: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.pbkdf2Sync(plainPassword, salt, ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}
