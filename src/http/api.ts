import { ABACATE_PAY_API_BASE, USER_AGENT } from "../config.js";
import { resolveApiKey } from "../utils/api-key.js";

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildErrorMessage(status: number, bodyText: string): string {
  let detail = bodyText;
  try {
    const parsed = JSON.parse(bodyText) as { error?: string };
    if (parsed?.error && typeof parsed.error === "string") {
      detail = parsed.error;
    }
  } catch {
    // use raw body
  }
  return `HTTP ${status}: ${detail}`;
}

export type MakeAbacatePayRequestOptions = {
  path: string;
  apiKey?: string;
  /** MCP streamable session id (HTTP); stdio typically omits. */
  sessionId?: string;
} & Omit<RequestInit, "headers"> & {
    headers?: HeadersInit;
  };

export async function makeAbacatePayRequest<T = unknown>(
  options: MakeAbacatePayRequestOptions
): Promise<T> {
  const {
    path,
    apiKey: apiKeyOverride,
    sessionId,
    headers: userHeaders,
    ...fetchInit
  } = options;
  const url = `${ABACATE_PAY_API_BASE}${normalizePath(path)}`;
  const authKey = resolveApiKey(sessionId, apiKeyOverride);
  if (!authKey) {
    throw new Error(
      "API key é obrigatória. No HTTP, use Authorization: Bearer ou X-API-Key; em stdio use ABACATE_PAY_API_KEY ou --key; opcionalmente passe apiKey na ferramenta."
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${authKey}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
  if (userHeaders && typeof userHeaders === "object" && !Array.isArray(userHeaders)) {
    Object.assign(headers, userHeaders as Record<string, string>);
  }

  const response = await fetch(url, {
    ...fetchInit,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(buildErrorMessage(response.status, errorText));
  }

  return response.json() as Promise<T>;
}
