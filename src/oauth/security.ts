import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { BlockList, isIPv4, isIPv6 } from "node:net";
import { setInterval } from "node:timers";
import type { Request } from "express";

// ---------------------------------------------------------------------------
// Client IP
//
// X-Forwarded-For is never trusted: anyone can send it, and the edge only
// appends to it. Fly-Client-IP is set by the Fly proxy and can't be forged.
// When the request reached Fly through Cloudflare, Fly-Client-IP is a
// Cloudflare address, so the real client is in CF-Connecting-IP — trusted only
// in that case, since a request straight to the Fly hostname could carry it.
// ---------------------------------------------------------------------------

// https://www.cloudflare.com/ips/
const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

const cloudflare = new BlockList();
for (const cidr of CLOUDFLARE_IPV4) {
  const [net, prefix] = cidr.split("/");
  cloudflare.addSubnet(net, Number(prefix), "ipv4");
}
for (const cidr of CLOUDFLARE_IPV6) {
  const [net, prefix] = cidr.split("/");
  cloudflare.addSubnet(net, Number(prefix), "ipv6");
}

function isCloudflareIp(ip: string): boolean {
  if (isIPv4(ip)) return cloudflare.check(ip, "ipv4");
  if (isIPv6(ip)) return cloudflare.check(ip, "ipv6");
  return false;
}

function header(req: Request, name: string): string | undefined {
  const value = req.get(name);
  return value?.trim() || undefined;
}

export function getClientIp(req: Request): string {
  const flyIp = header(req, "fly-client-ip");
  if (flyIp) {
    const cfIp = header(req, "cf-connecting-ip");
    if (cfIp && isCloudflareIp(flyIp)) return cfIp;
    return flyIp;
  }
  return req.socket?.remoteAddress ?? "unknown";
}

// ---------------------------------------------------------------------------
// Rate limiting — sliding window, per IP, with a bounded store
// ---------------------------------------------------------------------------

export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX_ENTRIES = 10_000;

export const rateLimitStore = new Map<string, number[]>();

/** Drops timestamps outside the window and IPs left with none. */
export function sweepRateLimitStore(now = Date.now()): void {
  for (const [ip, times] of rateLimitStore) {
    const recent = times.filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
    if (recent.length) rateLimitStore.set(ip, recent);
    else rateLimitStore.delete(ip);
  }
}

setInterval(() => sweepRateLimitStore(), 60_000).unref();

export function isRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (rateLimitStore.get(ip) ?? []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(ip, recent);
    return true;
  }

  if (!rateLimitStore.has(ip) && rateLimitStore.size >= RATE_LIMIT_MAX_ENTRIES) {
    sweepRateLimitStore(now);
    // Still full: evict the oldest IPs (Map keeps insertion order).
    for (const oldest of rateLimitStore.keys()) {
      if (rateLimitStore.size < RATE_LIMIT_MAX_ENTRIES) break;
      rateLimitStore.delete(oldest);
    }
  }

  rateLimitStore.set(ip, [...recent, now]);
  return false;
}

// ---------------------------------------------------------------------------
// CSRF — double submit: random token in a SameSite=Strict cookie on GET
// /authorize, echoed in a hidden field and compared on POST.
// ---------------------------------------------------------------------------

export const CSRF_COOKIE = "mcp_oauth_csrf";
const CSRF_MAX_AGE_SECONDS = 15 * 60;

export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function csrfCookie(token: string, secure: boolean): string {
  const attrs = [
    `${CSRF_COOKIE}=${token}`,
    "Path=/authorize",
    `Max-Age=${CSRF_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyCsrf(req: Request, submitted: string | undefined): boolean {
  const cookie = readCookie(req, CSRF_COOKIE);
  return Boolean(cookie && submitted && safeEqual(cookie, submitted));
}

// ---------------------------------------------------------------------------
// PKCE (S256)
// ---------------------------------------------------------------------------

export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

// ---------------------------------------------------------------------------
// Dynamic Client Registration metadata (RFC 7591 / RFC 8252)
// ---------------------------------------------------------------------------

export const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 100;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const FORBIDDEN_SCHEMES = new Set([
  "javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:", "ws:", "wss:",
]);

/**
 * https anywhere; http only on loopback (native apps, RFC 8252 §7.3);
 * private-use schemes for native apps (cursor://, vscode://) except the ones a
 * browser would execute or read locally. Returns the error, or null when valid.
 */
export function redirectUriError(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_REDIRECT_URI_LENGTH) {
    return "redirect_uris must be non-empty strings";
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `invalid redirect_uri: ${raw}`;
  }

  if (url.username || url.password) return "redirect_uri must not contain credentials";
  if (url.hash) return "redirect_uri must not contain a fragment";

  if (url.protocol === "https:") return url.hostname ? null : `invalid redirect_uri: ${raw}`;
  if (url.protocol === "http:") {
    return LOOPBACK_HOSTS.has(url.hostname) ? null : "http redirect_uri is only allowed for loopback";
  }
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return `redirect_uri scheme not allowed: ${url.protocol}`;
  return null;
}

export function sanitizeClientName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = raw.trim().slice(0, MAX_CLIENT_NAME_LENGTH);
  return name || undefined;
}

/** What the consent page shows as the destination of the API key. */
export function redirectTarget(redirectUri: string): string {
  const url = new URL(redirectUri);
  return url.protocol === "https:" || url.protocol === "http:" ? url.host : `${url.protocol}//${url.host}`;
}
