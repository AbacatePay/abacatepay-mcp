import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
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
  CREATE TABLE IF NOT EXISTS oauth_codes (
    code                  TEXT PRIMARY KEY,
    client_id             TEXT NOT NULL,
    redirect_uri          TEXT NOT NULL,
    code_challenge        TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256',
    api_key_enc           TEXT NOT NULL,
    expires_at            INTEGER NOT NULL
  )
`);

// Remove any codes that expired before this process started
db.run("DELETE FROM oauth_codes WHERE expires_at < ?", [Date.now()]);

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmts = {
  insertClient: db.prepare(
    "INSERT INTO oauth_clients (client_id, secret_enc, redirect_uris, client_name) VALUES ($id, $secretEnc, $uris, $name)"
  ),
  selectClient: db.prepare(
    "SELECT client_id, secret_enc, redirect_uris, client_name FROM oauth_clients WHERE client_id = $id"
  ),
  insertCode: db.prepare(
    "INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, api_key_enc, expires_at) VALUES ($code, $clientId, $redirectUri, $codeChallenge, $codeChallengeMethod, $apiKeyEnc, $expiresAt)"
  ),
  selectCode: db.prepare(
    "SELECT code, client_id, redirect_uri, code_challenge, code_challenge_method, api_key_enc, expires_at FROM oauth_codes WHERE code = $code"
  ),
  deleteCode: db.prepare("DELETE FROM oauth_codes WHERE code = $code"),
  deleteExpiredCodes: db.prepare("DELETE FROM oauth_codes WHERE expires_at < $now"),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
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
}

// ---------------------------------------------------------------------------
// Client operations
// ---------------------------------------------------------------------------

export function registerClient(
  redirectUris: string[],
  clientName?: string
): OAuthClient {
  const clientId = randomUUID();
  const clientSecret = randomUUID();

  stmts.insertClient.run({
    $id: clientId,
    $secretEnc: encrypt(clientSecret, encKey),
    $uris: JSON.stringify(redirectUris),
    $name: clientName ?? null,
  });

  return { clientId, clientSecret, redirectUris, clientName };
}

export function getClient(clientId: string): OAuthClient | undefined {
  const row = stmts.selectClient.get({ $id: clientId }) as {
    client_id: string;
    secret_enc: string;
    redirect_uris: string;
    client_name: string | null;
  } | null;

  if (!row) return undefined;

  return {
    clientId: row.client_id,
    clientSecret: decrypt(row.secret_enc, encKey),
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
  apiKey: string
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
  });

  return code;
}

/** Atomically consume a code: deletes it and returns the payload, or undefined if missing/expired. */
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
  } | null;

  if (!row) return undefined;

  stmts.deleteCode.run({ $code: code });

  if (Date.now() > row.expires_at) return undefined;

  return {
    code: row.code,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: "S256",
    apiKey: decrypt(row.api_key_enc, encKey),
    expiresAt: row.expires_at,
  };
}
