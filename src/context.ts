/** Per MCP streamable session id → API key (HTTP multi-tenant). */

const sessionApiKeys = new Map<string, string>();

export function setSessionApiKey(sessionId: string, apiKey: string): void {
  sessionApiKeys.set(sessionId, apiKey);
}

export function getSessionApiKey(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  return sessionApiKeys.get(sessionId);
}

export function clearSessionApiKey(sessionId: string): void {
  sessionApiKeys.delete(sessionId);
}
