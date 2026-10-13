import { Database } from "bun:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { decrypt, encrypt, loadEncryptionKey } from "./crypto.js";

// ---------------------------------------------------------------------------
// Database bootstrap
// ---------------------------------------------------------------------------

const DB_PATH = resolve(process.env.OAUTH_DB_PATH ?? "./oauth.db");

const dbDir = dirname(DB_PATH);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- dbDir derived from OAUTH_DB_PATH operator config, not user input
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const encKey = loadEncryptionKey(DB_PATH);

const db = new Database(DB_PATH);

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = NORMAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`
  CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id     TEXT PRIMARY KEY,
    secret_enc    TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    client_name   TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    token_hash  TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL,
    api_key_enc TEXT NOT NULL,
    scope       TEXT,
    created_at  INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS oauth_codes (
    code                  TEXT PRIMARY KEY,
    client_id             TEXT NOT NULL,
    redirect_uri          TEXT NOT NULL,
    code_challenge        TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256',
    api_key_enc           TEXT NOT NULL,
    expires_at            INTEGER NOT NULL,
    scope                 TEXT,
    resource              TEXT
  )
`);

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

const { user_version: schemaVersion } = db.query("PRAGMA user_version").get() as { user_version: number };

if (schemaVersion < 1) {
  // Existing DBs on v0 schema don't have scope/resource columns yet.
  // ALTER TABLE fails silently if the column already exists (fresh DBs).
  for (const col of ["scope TEXT", "resource TEXT"]) {
    try { db.run(`ALTER TABLE oauth_codes ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  db.run("PRAGMA user_version = 1");
}

// ---------------------------------------------------------------------------
// Startup cleanup
// ---------------------------------------------------------------------------

db.run("DELETE FROM oauth_codes WHERE expires_at < ?", [Date.now()]);

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmts = {
  insertClient: db.prepare(
    "INSERT INTO oauth_clients (client_id, secret_enc, redirect_uris, client_name) VALUES ($id, $secretEnc, $uris, $name)"
  ),
  selectClient: db.prepare(
    "SELECT client_id, redirect_uris, client_name FROM oauth_clients WHERE client_id = $id"
  ),
  insertCode: db.prepare(
    `INSERT INTO oauth_codes
       (code, client_id, redirect_uri, code_challenge, code_challenge_method, api_key_enc, expires_at, scope, resource)
     VALUES
       ($code, $clientId, $redirectUri, $codeChallenge, $codeChallengeMethod, $apiKeyEnc, $expiresAt, $scope, $resource)`
  ),
  selectCode: db.prepare(
    `SELECT code, client_id, redirect_uri, code_challenge, code_challenge_method,
            api_key_enc, expires_at, scope, resource
     FROM oauth_codes WHERE code = $code`
  ),
  deleteCode: db.prepare("DELETE FROM oauth_codes WHERE code = $code"),
  deleteExpiredCodes: db.prepare("DELETE FROM oauth_codes WHERE expires_at < $now"),
  insertToken: db.prepare(
    `INSERT INTO oauth_tokens (token_hash, client_id, api_key_enc, scope, created_at)
     VALUES ($hash, $clientId, $apiKeyEnc, $scope, $createdAt)`
  ),
  selectToken: db.prepare("SELECT api_key_enc FROM oauth_tokens WHERE token_hash = $hash"),
  deleteToken: db.prepare("DELETE FROM oauth_tokens WHERE token_hash = $hash"),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
}

export interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  apiKey: string;
  expiresAt: number;
  scope?: string;
  resource?: string;
}

// ---------------------------------------------------------------------------
// Client operations
// ---------------------------------------------------------------------------

export function registerClient(
  redirectUris: string[],
  clientName?: string
): OAuthClient {
  // Public clients (token_endpoint_auth_method "none") — no secret is issued.
  // The column stays for rows registered before that.
  const clientId = randomUUID();

  stmts.insertClient.run({
    $id: clientId,
    $secretEnc: "",
    $uris: JSON.stringify(redirectUris),
    $name: clientName ?? null,
  });

  return { clientId, redirectUris, clientName };
}

export function getClient(clientId: string): OAuthClient | undefined {
  const row = stmts.selectClient.get({ $id: clientId }) as {
    client_id: string;
    redirect_uris: string;
    client_name: string | null;
  } | null;

  if (!row) return undefined;

  return {
    clientId: row.client_id,
    redirectUris: JSON.parse(row.redirect_uris) as string[],
    clientName: row.client_name ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Auth code operations
// ---------------------------------------------------------------------------

export function createAuthCode(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  apiKey: string,
  scope?: string,
  resource?: string,
): string {
  const code = randomUUID();

  stmts.insertCode.run({
    $code: code,
    $clientId: clientId,
    $redirectUri: redirectUri,
    $codeChallenge: codeChallenge,
    $codeChallengeMethod: "S256",
    $apiKeyEnc: encrypt(apiKey, encKey),
    $expiresAt: Date.now() + 5 * 60 * 1000,
    $scope: scope ?? null,
    $resource: resource ?? null,
  });

  return code;
}

/** Atomically consume a code: deletes it and returns the payload, or undefined if missing/expired/tampered. */
export function consumeAuthCode(code: string): AuthCode | undefined {
  stmts.deleteExpiredCodes.run({ $now: Date.now() });

  const row = stmts.selectCode.get({ $code: code }) as {
    code: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    api_key_enc: string;
    expires_at: number;
    scope: string | null;
    resource: string | null;
  } | null;

  if (!row) return undefined;

  stmts.deleteCode.run({ $code: code });

  if (Date.now() > row.expires_at) return undefined;

  let apiKey: string;
  try {
    apiKey = decrypt(row.api_key_enc, encKey);
  } catch {
    // Decryption failure means key rotation or tampered row — treat as invalid
    return undefined;
  }

  return {
    code: row.code,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: "S256",
    apiKey,
    expiresAt: row.expires_at,
    scope: row.scope ?? undefined,
    resource: row.resource ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Access tokens
//
// The token handed to the MCP client is opaque; the API key stays here,
// encrypted, and is looked up on each /mcp request. Only the token's hash is
// stored. Revoking the API key in the dashboard also kills the token, since
// every call made with it goes through the API.
// ---------------------------------------------------------------------------

export const ACCESS_TOKEN_PREFIX = "mcp_at_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueAccessToken(clientId: string, apiKey: string, scope?: string): string {
  const token = ACCESS_TOKEN_PREFIX + randomBytes(32).toString("base64url");

  stmts.insertToken.run({
    $hash: hashToken(token),
    $clientId: clientId,
    $apiKeyEnc: encrypt(apiKey, encKey),
    $scope: scope ?? null,
    $createdAt: Date.now(),
  });

  return token;
}

/** The API key behind an access token, or undefined if unknown, revoked or unreadable. */
export function resolveAccessToken(token: string): string | undefined {
  const row = stmts.selectToken.get({ $hash: hashToken(token) }) as { api_key_enc: string } | null;
  if (!row) return undefined;

  try {
    return decrypt(row.api_key_enc, encKey);
  } catch {
    return undefined;
  }
}

export function revokeAccessToken(token: string): void {
  stmts.deleteToken.run({ $hash: hashToken(token) });
}
