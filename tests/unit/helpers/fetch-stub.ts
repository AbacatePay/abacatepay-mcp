export type FetchCall = { url: string; init: RequestInit };

let originalFetch: typeof globalThis.fetch | undefined;

/** Replaces globalThis.fetch with a stub that responds with body/status and records calls. */
export function stubFetch(body: unknown, status = 200): FetchCall[] {
  const calls: FetchCall[] = [];
  if (originalFetch === undefined) originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return calls;
}

export function restoreFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = undefined;
  }
}
