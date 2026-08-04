import { validateApiKey } from "../config.js";
import { getSessionApiKey } from "../context.js";

const INVALID_PLACEHOLDERS = [
  "sua_chave_api",
  "sua-chave-api",
  "sua_chave",
  "sua-chave",
  "your_api_key",
  "your-api-key",
  "your_api",
  "your-api",
  "api_key_here",
  "api-key-here",
  "api_key",
  "api-key",
  "chave_api",
  "chave-api",
  "chave",
  "key",
];

function isPlaceholderApiKey(apiKey: string): boolean {
  const normalized = apiKey.toLowerCase().trim();
  return INVALID_PLACEHOLDERS.some(
    (p) => normalized === p || normalized.includes(p)
  );
}

/**
 * 1) Tool param (non-placeholder) → 2) session registry → 3) global env/argv
 */
export function resolveApiKey(
  sessionId: string | undefined,
  paramApiKey?: string
): string | null {
  if (paramApiKey?.trim()) {
    if (!isPlaceholderApiKey(paramApiKey)) {
      return paramApiKey;
    }
  }

  const fromSession = getSessionApiKey(sessionId);
  if (fromSession?.trim()) {
    return fromSession;
  }

  const globalKey = validateApiKey();
  if (globalKey?.trim()) {
    return globalKey;
  }

  return null;
}
