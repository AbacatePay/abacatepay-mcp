import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Request, Response } from "express";

// store.ts opens the SQLite DB at import time — point it at a throwaway dir first.
const dbDir = mkdtempSync(join(tmpdir(), "mcp-oauth-test-"));
process.env.OAUTH_DB_PATH = join(dbDir, "oauth.db");

const { ABACATE_PAY_API_BASE, PUBLIC_BASE_URL } = await import("../../src/config.js");
const { oauthRouter } = await import("../../src/oauth/routes.js");
const { validateApiKeyMiddleware } = await import("../../src/http/middleware.js");
const security = await import("../../src/oauth/security.js");

const VICTIM_KEY = "abc_victim_key";

// Calls to the AbacatePay API are answered here; everything else hits the local test server.
let apiStatus = 200;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  if (String(input).startsWith(ABACATE_PAY_API_BASE)) {
    const auth = new Headers(init?.headers).get("authorization");
    const status = auth === `Bearer ${VICTIM_KEY}` ? apiStatus : 401;
    return new Response("{}", { status });
  }
  return realFetch(input as RequestInfo, init);
}) as typeof globalThis.fetch;

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(oauthRouter);
  app.use("/mcp", validateApiKeyMiddleware, (req: Request, res: Response) => {
    res.json({ key: (req as Request & { validatedApiKey?: string }).validatedApiKey });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => {
  server?.close();
  globalThis.fetch = realFetch;
  rmSync(dbDir, { recursive: true, force: true });
});

beforeEach(() => {
  apiStatus = 200;
  security.rateLimitStore.clear();
});

async function register(redirect_uris: unknown, client_name?: unknown) {
  return fetch(`${base}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris, client_name }),
  });
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function openConsent(clientId: string, redirectUri: string, challenge: string) {
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    response_type: "code",
    state: "xyz",
  });
  const res = await fetch(`${base}/authorize?${qs}`);
  const html = await res.text();
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const csrf = /name="csrf_token"\s+value="([^"]+)"/.exec(html)?.[1] ?? "";
  return { res, html, cookie, csrf };
}

async function submitConsent(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return fetch(`${base}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

describe("metadata", () => {
  test("issuer and endpoints ignore X-Forwarded-Host / Proto", async () => {
    const headers = { "X-Forwarded-Host": "evil.example", "X-Forwarded-Proto": "http" };
    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`, { headers })).json();
    expect(as.issuer).toBe(PUBLIC_BASE_URL);
    expect(as.authorization_endpoint).toBe(`${PUBLIC_BASE_URL}/authorize`);
    expect(as.registration_endpoint).toBe(`${PUBLIC_BASE_URL}/register`);

    const pr = await (await fetch(`${base}/.well-known/oauth-protected-resource`, { headers })).json();
    expect(pr.resource).toBe(`${PUBLIC_BASE_URL}/mcp`);
    expect(pr.authorization_servers).toEqual([PUBLIC_BASE_URL]);
  });

  test("401 from /mcp points at the fixed resource metadata URL", async () => {
    const res = await fetch(`${base}/mcp`, { headers: { "X-Forwarded-Host": "evil.example" } });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`);
  });
});

describe("dynamic client registration", () => {
  test.each([
    ["http://insecure.example/cb"],
    ["not a url"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["https://user:pass@example.com/cb"],
    ["https://example.com/cb#frag"],
  ])("rejects %s", async (uri) => {
    const res = await register([uri]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_redirect_uri");
  });

  test("rejects more than the allowed number of redirect_uris", async () => {
    const uris = Array.from({ length: security.MAX_REDIRECT_URIS + 1 }, (_, i) => `https://a.example/${i}`);
    expect((await register(uris)).status).toBe(400);
  });

  test("accepts https, loopback http and native app schemes, without issuing a secret", async () => {
    const uris = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:33418/cb", "cursor://anysphere.cursor-mcp/oauth/callback"];
    const res = await register(uris, "x".repeat(500));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.redirect_uris).toEqual(uris);
    expect(body.client_secret).toBeUndefined();
    expect(body.client_name).toHaveLength(100);
  });
});

describe("authorization flow", () => {
  const redirectUri = "https://client.example/cb";
  let clientId = "";

  beforeAll(async () => {
    clientId = (await (await register([redirectUri], "Cliente <b>Teste</b>")).json()).client_id;
  });

  test("consent page names the client and the destination, and sets the CSRF cookie", async () => {
    const { res, html, cookie, csrf } = await openConsent(clientId, redirectUri, pkce().challenge);
    expect(res.status).toBe(200);
    expect(html).toContain("Cliente &lt;b&gt;Teste&lt;/b&gt;");
    expect(html).toContain("client.example");
    expect(csrf).not.toBe("");
    expect(cookie).toBe(`${security.CSRF_COOKIE}=${csrf}`);
    expect(res.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  test("POST without the CSRF cookie is refused", async () => {
    const { challenge } = pkce();
    const { csrf } = await openConsent(clientId, redirectUri, challenge);
    const res = await submitConsent({ client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, api_key: VICTIM_KEY, csrf_token: csrf });
    expect(res.status).toBe(400);
  });

  test("POST with a CSRF token that doesn't match the cookie is refused", async () => {
    const { challenge } = pkce();
    const { cookie } = await openConsent(clientId, redirectUri, challenge);
    const res = await submitConsent(
      { client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, api_key: VICTIM_KEY, csrf_token: "forged" },
      { Cookie: cookie },
    );
    expect(res.status).toBe(400);
  });

  test("API error while validating the key does not issue a code", async () => {
    apiStatus = 500;
    const { challenge } = pkce();
    const { cookie, csrf } = await openConsent(clientId, redirectUri, challenge);
    const res = await submitConsent(
      { client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, api_key: VICTIM_KEY, csrf_token: csrf },
      { Cookie: cookie },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Não conseguimos validar sua chave agora");
  });

  test("issues an opaque token that resolves to the key on /mcp and dies on /revoke", async () => {
    const { verifier, challenge } = pkce();
    const { cookie, csrf } = await openConsent(clientId, redirectUri, challenge);
    const authorized = await submitConsent(
      { client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, api_key: VICTIM_KEY, state: "xyz", csrf_token: csrf },
      { Cookie: cookie, "X-Forwarded-Host": "evil.example" },
    );
    expect(authorized.status).toBe(302);
    const location = new URL(authorized.headers.get("location")!);
    expect(location.origin).toBe("https://client.example");
    expect(location.searchParams.get("iss")).toBe(PUBLIC_BASE_URL);

    const tokenRes = await fetch(`${base}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: location.searchParams.get("code")!,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        client_id: clientId,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const { access_token } = await tokenRes.json();
    expect(access_token).not.toBe(VICTIM_KEY);
    expect(access_token).not.toContain(VICTIM_KEY);
    expect(access_token.startsWith("mcp_at_")).toBe(true);

    const mcp = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${access_token}` } });
    expect((await mcp.json()).key).toBe(VICTIM_KEY);

    await fetch(`${base}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: access_token }),
    });
    const revoked = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${access_token}` } });
    expect(revoked.status).toBe(401);
    expect(revoked.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  test("a raw API key still works as bearer on /mcp", async () => {
    const res = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${VICTIM_KEY}` } });
    expect((await res.json()).key).toBe(VICTIM_KEY);
  });

  test("rotating X-Forwarded-For does not get around the rate limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < security.RATE_LIMIT_MAX + 4; i++) {
      const res = await submitConsent({ client_id: "nope" }, { "X-Forwarded-For": `198.51.100.${i}` });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(4);
  });
});

describe("client IP", () => {
  function req(headers: Record<string, string>) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      get: (name: string) => lower[name.toLowerCase()],
      socket: { remoteAddress: "10.0.0.9" },
    } as unknown as Request;
  }

  test("never uses X-Forwarded-For", () => {
    expect(security.getClientIp(req({ "X-Forwarded-For": "1.2.3.4", "Fly-Client-IP": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(security.getClientIp(req({ "X-Forwarded-For": "1.2.3.4" }))).toBe("10.0.0.9");
  });

  test("uses CF-Connecting-IP only when the request came through Cloudflare", () => {
    expect(security.getClientIp(req({ "Fly-Client-IP": "172.70.1.1", "CF-Connecting-IP": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(security.getClientIp(req({ "Fly-Client-IP": "2606:4700::1", "CF-Connecting-IP": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(security.getClientIp(req({ "Fly-Client-IP": "5.6.7.8", "CF-Connecting-IP": "9.9.9.9" }))).toBe("5.6.7.8");
  });
});

describe("rate limit store", () => {
  test("stays bounded under many distinct IPs", () => {
    const now = Date.now();
    for (let i = 0; i < security.RATE_LIMIT_MAX_ENTRIES + 500; i++) security.isRateLimited(`ip-${i}`, now);
    expect(security.rateLimitStore.size).toBeLessThanOrEqual(security.RATE_LIMIT_MAX_ENTRIES);
  });

  test("sweep drops IPs whose attempts left the window", () => {
    const old = Date.now() - security.RATE_LIMIT_WINDOW_MS - 1;
    security.isRateLimited("stale", old);
    security.isRateLimited("fresh");
    security.sweepRateLimitStore();
    expect(security.rateLimitStore.has("stale")).toBe(false);
    expect(security.rateLimitStore.has("fresh")).toBe(true);
  });
});

describe("pkce", () => {
  test("verifies S256 and rejects a wrong verifier", () => {
    const { verifier, challenge } = pkce();
    expect(security.verifyPkce(verifier, challenge)).toBe(true);
    expect(security.verifyPkce("wrong", challenge)).toBe(false);
  });
});
