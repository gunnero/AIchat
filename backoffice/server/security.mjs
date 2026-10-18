import {
  randomBytes,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
  scrypt as scryptCallback,
} from "node:crypto";
import { promisify } from "node:util";
import * as OTPAuth from "otpauth";
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString("base64url");
export const digest = (s) => createHash("sha256").update(s).digest("hex");
export const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export const csrfFor = (key, session) =>
  createHmac("sha256", key)
    .update("csrf:" + session)
    .digest("base64url");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const result = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt}$${result.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [kind, salt, expected] = encoded.split("$");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const result = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return equal(result.toString("hex"), expected);
}
export function seal(key, value, context) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function unseal(key, value, context) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1") throw new Error("Unsupported encrypted record");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    cipher.update(Buffer.from(encrypted, "base64url")),
    cipher.final(),
  ]).toString("utf8");
}
export function otp(secret, label = "Administration") {
  return new OTPAuth.TOTP({
    issuer: "AI Kundetypeassistent",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}
export function newOtpSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}
export function otpStep(secret, code, now) {
  const delta = otp(secret).validate({
    token: code,
    timestamp: now,
    window: 1,
  });
  return delta === null ? null : Math.floor(now / 30000) + delta;
}
