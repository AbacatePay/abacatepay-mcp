import { validateApiKey, ABACATE_PAY_API_BASE, USER_AGENT } from "../config.js";

export async function makeAbacatePayRequest<T = any>(
  endpoint: string, 
  apiKey?: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${ABACATE_PAY_API_BASE}${endpoint}`;
  
  // Use provided API key or fall back to global API key
  const authKey = apiKey || validateApiKey();
  
  const headers = {
    'Authorization': `Bearer ${authKey}`,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
} 