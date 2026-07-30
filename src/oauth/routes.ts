import { createHash } from "node:crypto";
import express from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ABACATE_PAY_API_BASE, USER_AGENT } from "../config.js";
import {
  consumeAuthCode,
  createAuthCode,
  getClient,
  registerClient,
} from "./store.js";

type ExpressWithParsers = {
  json: (opts?: object) => RequestHandler;
  urlencoded: (opts?: object) => RequestHandler;
};
const _express = express as unknown as ExpressWithParsers;
const jsonParser = _express.json();
const urlencodedParser = _express.urlencoded({ extended: false });

type BodyRequest = Request & { body?: unknown };

export const oauthRouter = express.Router();

// ---------------------------------------------------------------------------
// CORS — all OAuth endpoints must be reachable from browser contexts
// ---------------------------------------------------------------------------
oauthRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Rate limiting — sliding window, per IP
// Applied to POST /authorize because it calls the AbacatePay API on every
// submission, making it a key-validation oracle if left open.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const rateLimitStore = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff) return xff.split(",")[0].trim();
  const flyIp = req.headers["fly-client-ip"];
  if (typeof flyIp === "string" && flyIp) return flyIp;
  return "unknown";
}

function isRateLimited(req: Request): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  const recent = (rateLimitStore.get(ip) ?? []).filter(t => t > now - RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(ip, recent);
    return true;
  }
  rateLimitStore.set(ip, [...recent, now]);
  return false;
}

// ---------------------------------------------------------------------------
// RFC 9728 — OAuth 2.0 Protected Resource Metadata
// ---------------------------------------------------------------------------
oauthRouter.get("/.well-known/oauth-protected-resource", (req: Request, res: Response) => {
  const base = serverBase(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/AbacatePay/abacatepay-mcp",
    scopes_supported: ["mcp"],
  });
});

// ---------------------------------------------------------------------------
// RFC 8414 — OAuth 2.0 Authorization Server Metadata
// ---------------------------------------------------------------------------
oauthRouter.get("/.well-known/oauth-authorization-server", (req: Request, res: Response) => {
  const base = serverBase(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
    revocation_endpoint: `${base}/revoke`,
  });
});

// ---------------------------------------------------------------------------
// Dynamic Client Registration (RFC 7591)
// ---------------------------------------------------------------------------
oauthRouter.post("/register", jsonParser, (req: Request, res: Response) => {
  const body = ((req as BodyRequest).body ?? {}) as Record<string, unknown>;
  const { redirect_uris, client_name } = body;

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    res.status(400).json({
      error: "invalid_client_metadata",
      error_description: "redirect_uris is required",
    });
    return;
  }

  const client = registerClient(redirect_uris as string[], client_name as string | undefined);

  res.status(201).json({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uris: client.redirectUris,
    client_name: client.clientName,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
});

// ---------------------------------------------------------------------------
// Authorization endpoint — GET (show form)
// ---------------------------------------------------------------------------
oauthRouter.get("/authorize", (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const {
    client_id, redirect_uri, code_challenge,
    code_challenge_method, state, response_type,
    scope, resource,
  } = q;

  const paramError = validateAuthorizeParams({ client_id, redirect_uri, code_challenge, code_challenge_method, response_type });
  if (paramError) {
    res.status(400).send(errorPage(paramError));
    return;
  }

  setFormSecurityHeaders(res);
  res.send(authorizePage({
    clientId: client_id!,
    redirectUri: redirect_uri!,
    codeChallenge: code_challenge!,
    state,
    scope,
    resource,
  }));
});

// ---------------------------------------------------------------------------
// Authorization endpoint — POST (process API key submission)
// ---------------------------------------------------------------------------
oauthRouter.post("/authorize", urlencodedParser, async (req: Request, res: Response) => {
  if (isRateLimited(req)) {
    res.status(429).json({
      error: "too_many_requests",
      error_description: "Too many authorization attempts. Try again in 15 minutes.",
    });
    return;
  }

  const body = ((req as BodyRequest).body ?? {}) as Record<string, string | undefined>;
  const { client_id, redirect_uri, code_challenge, state, api_key, scope, resource } = body;

  if (!client_id || !redirect_uri || !code_challenge || !api_key) {
    setFormSecurityHeaders(res);
    res.status(400).send(errorPage("Missing required fields."));
    return;
  }

  const client = getClient(client_id);
  if (!client || !client.redirectUris.includes(redirect_uri)) {
    setFormSecurityHeaders(res);
    res.status(400).send(errorPage("Invalid client or redirect URI."));
    return;
  }

  const valid = await validateAbacatePayKey(api_key);
  if (!valid) {
    setFormSecurityHeaders(res);
    res.send(authorizePage({
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      state,
      scope,
      resource,
      error: "API key inválida. Verifique sua chave no painel do Abacate Pay.",
    }));
    return;
  }

  const code = createAuthCode(client_id, redirect_uri, code_challenge, api_key, scope, resource);

  const base = serverBase(req);
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("iss", base);   // RFC 9207 — issuer identification
  if (state) redirectUrl.searchParams.set("state", state);

  res.redirect(redirectUrl.toString());
});

// ---------------------------------------------------------------------------
// Token endpoint — exchange code for access token
// ---------------------------------------------------------------------------
oauthRouter.post("/token", urlencodedParser, jsonParser, (req: Request, res: Response) => {
  const body = ((req as BodyRequest).body ?? {}) as Record<string, string | undefined>;
  const { grant_type, code, redirect_uri, code_verifier, client_id, resource } = body;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  if (!code || !redirect_uri || !code_verifier || !client_id) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing required parameters",
    });
    return;
  }

  const entry = consumeAuthCode(code);
  if (!entry) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code is invalid or expired",
    });
    return;
  }

  if (entry.clientId !== client_id || entry.redirectUri !== redirect_uri) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "client_id or redirect_uri mismatch",
    });
    return;
  }

  // RFC 8707: resource sent in token request must match what was authorized
  if (entry.resource && resource && entry.resource !== resource) {
    res.status(400).json({
      error: "invalid_target",
      error_description: "resource parameter does not match the authorized resource",
    });
    return;
  }

  if (!verifyPkce(code_verifier, entry.codeChallenge)) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: "PKCE verification failed",
    });
    return;
  }

  const tokenResponse: Record<string, string> = {
    access_token: entry.apiKey,
    token_type: "bearer",
  };
  if (entry.scope) tokenResponse.scope = entry.scope;

  res.json(tokenResponse);
});

// ---------------------------------------------------------------------------
// Token revocation stub (RFC 7009)
// API keys don't expire server-side; this satisfies clients that POST /revoke
// after disconnecting.
// ---------------------------------------------------------------------------
oauthRouter.post("/revoke", urlencodedParser, jsonParser, (_req: Request, res: Response) => {
  res.status(200).end();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function serverBase(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
  return `${proto}://${host}`;
}

function setFormSecurityHeaders(res: Response): void {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
}

function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

async function validateAbacatePayKey(apiKey: string): Promise<boolean> {
  try {
    const resp = await fetch(`${ABACATE_PAY_API_BASE}/stores/get`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(8000),
    });
    return resp.status !== 401 && resp.status !== 403;
  } catch {
    return false;
  }
}

interface AuthorizePageOptions {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scope?: string;
  resource?: string;
  error?: string;
}

function validateAuthorizeParams(params: Record<string, string | undefined>): string | null {
  if (!params.client_id) return "Missing client_id.";
  if (!params.redirect_uri) return "Missing redirect_uri.";
  if (!params.code_challenge) return "Missing code_challenge.";
  if (params.code_challenge_method !== "S256") return "Only S256 code_challenge_method is supported.";
  if (params.response_type !== "code") return "Only response_type=code is supported.";
  if (!getClient(params.client_id)) return "Unknown client_id. Please reconnect the MCP client.";
  return null;
}

function authorizePage(opts: AuthorizePageOptions): string {
  const { clientId, redirectUri, codeChallenge, state, scope, resource, error } = opts;
  const errorHtml = error ? `<p class="error">${esc(error)}</p>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Abacate Pay — Conectar</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 2.5rem 2rem;
      max-width: 440px;
      width: 100%;
    }
    .logo { font-size: 2rem; text-align: center; margin-bottom: 0.5rem; }
    h1 { font-size: 1.25rem; font-weight: 700; text-align: center; color: #1a1a1a; margin-bottom: 0.25rem; }
    .subtitle { font-size: 0.875rem; color: #666; text-align: center; margin-bottom: 1.75rem; }
    label { display: block; font-size: 0.8125rem; font-weight: 600; color: #333; margin-bottom: 0.375rem; }
    input[type="password"] {
      width: 100%;
      padding: 0.625rem 0.875rem;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 0.9375rem;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus { border-color: #4f9c3e; }
    .error {
      background: #fff0f0;
      color: #c0392b;
      border: 1px solid #f5c6c6;
      border-radius: 6px;
      padding: 0.625rem 0.875rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    button {
      display: block;
      width: 100%;
      margin-top: 1.25rem;
      padding: 0.75rem;
      background: #4f9c3e;
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #3d7c2f; }
    .help { font-size: 0.8125rem; color: #888; text-align: center; margin-top: 1.25rem; }
    .help a { color: #4f9c3e; text-decoration: none; }
    .help a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🥑</div>
    <h1>Conectar ao Abacate Pay</h1>
    <p class="subtitle">Insira sua chave de API para autorizar o acesso ao seu assistente de IA.</p>
    ${errorHtml}
    <form method="POST" action="/authorize" autocomplete="off">
      <input type="hidden" name="client_id"      value="${esc(clientId)}" />
      <input type="hidden" name="redirect_uri"   value="${esc(redirectUri)}" />
      <input type="hidden" name="code_challenge" value="${esc(codeChallenge)}" />
      <input type="hidden" name="state"          value="${esc(state ?? "")}" />
      <input type="hidden" name="scope"          value="${esc(scope ?? "")}" />
      <input type="hidden" name="resource"       value="${esc(resource ?? "")}" />
      <label for="api_key">Chave de API</label>
      <input type="password" id="api_key" name="api_key" placeholder="abacatepay_..." required autofocus />
      <button type="submit">Autorizar</button>
    </form>
    <p class="help">
      Encontre sua chave em
      <a href="https://app.abacatepay.com/settings/api" target="_blank" rel="noopener">Configurações → API</a>.
    </p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Erro — Abacate Pay</title>
  <style>
    body { font-family: sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f5f5f0; }
    .box { background:#fff; border-radius:12px; padding:2rem; max-width:400px; text-align:center; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
    h1 { color:#c0392b; margin-bottom:0.75rem; }
    p { color:#555; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Erro de autorização</h1>
    <p>${esc(message)}</p>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
