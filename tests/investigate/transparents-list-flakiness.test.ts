import { describe, expect, test } from "bun:test";

/**
 * Standalone investigation for an intermittent failure observed on the real
 * `GET /v2/transparents/list` endpoint: identical requests (same URL, same
 * headers, no params) alternate between `{"success":true,"data":[...]}` and
 * `{"success":false,"data":null}` (no `error` message on the failing ones).
 *
 * Not part of the default `bun test tests/unit` run or `test:smoke` — this
 * hits the live API repeatedly and is expected to show failures. Run it
 * directly to gather evidence for a backend bug report:
 *
 *   ABACATE_PAY_API_KEY=<key> bun test tests/investigate
 *
 * Each case reports a success/failure tally instead of asserting 100% success,
 * since the point is to characterize the flakiness, not to pass/fail on it.
 */

const KEY = process.env.ABACATE_PAY_API_KEY;
const BASE = "https://api.abacatepay.com/v2";
const ENABLED = Boolean(KEY);

type Attempt = { ok: boolean; status: number; body: string };

async function attempt(path: string, init: RequestInit = {}): Promise<Attempt> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = await res.text();
  let ok: boolean;
  try {
    ok = JSON.parse(body).success === true;
  } catch {
    ok = false;
  }
  return { ok, status: res.status, body };
}

async function repeat(label: string, n: number, path: string, init?: RequestInit) {
  const results: Attempt[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await attempt(path, init));
  }
  const successes = results.filter((r) => r.ok).length;
  const failures = results.filter((r) => !r.ok);
  console.log(
    `\n=== ${label} ===\n${successes}/${n} succeeded` +
      (failures.length
        ? `\nsample failure: status=${failures[0].status} body=${failures[0].body.slice(0, 200)}`
        : "")
  );
  return { successes, total: n, failures };
}

describe.skipIf(!ENABLED)("transparents/list flakiness investigation", () => {
  test("bare request, no query params, repeated", async () => {
    const { successes, total } = await repeat("bare, no params", 10, "/transparents/list");
    // Soft assertion: we know some will fail. This just confirms the endpoint
    // is reachable and returning valid JSON on at least some attempts.
    expect(successes).toBeGreaterThan(0);
    expect(successes).toBeLessThanOrEqual(total);
  });

  test("with ?limit=3, repeated", async () => {
    const { successes } = await repeat("?limit=3", 10, "/transparents/list?limit=3");
    expect(successes).toBeGreaterThanOrEqual(0);
  });

  test("with ?status=PAID, repeated", async () => {
    const { successes } = await repeat("?status=PAID", 5, "/transparents/list?status=PAID");
    expect(successes).toBeGreaterThanOrEqual(0);
  });

  test("with ?method=PIX, repeated", async () => {
    const { successes } = await repeat("?method=PIX", 5, "/transparents/list?method=PIX");
    expect(successes).toBeGreaterThanOrEqual(0);
  });

  test("with Content-Type: application/json header on a bodyless GET, repeated", async () => {
    const { successes } = await repeat(
      "Content-Type header, no body",
      10,
      "/transparents/list?limit=3",
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    expect(successes).toBeGreaterThanOrEqual(0);
  });

  test("without Content-Type header, repeated (control for the header theory)", async () => {
    const { successes } = await repeat(
      "no Content-Type header",
      10,
      "/transparents/list?limit=3",
      { method: "GET" }
    );
    expect(successes).toBeGreaterThanOrEqual(0);
  });

  test("control: /customers/list repeated the same number of times", async () => {
    const { successes, total } = await repeat("/customers/list (control)", 10, "/customers/list?limit=3");
    // If this endpoint is consistently 100% while transparents/list isn't,
    // that points at something specific to the transparents/list handler
    // rather than a general rate limit or auth flakiness.
    expect(successes).toBe(total);
  });

  test("control: /checkouts/list repeated the same number of times", async () => {
    const { successes, total } = await repeat("/checkouts/list (control)", 10, "/checkouts/list?limit=3");
    expect(successes).toBe(total);
  });
});

if (!ENABLED) {
  // eslint-disable-next-line no-console
  console.log("Skipped: set ABACATE_PAY_API_KEY (a v2 key) to run this investigation.");
}
