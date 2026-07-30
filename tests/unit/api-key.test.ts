import { afterEach, describe, expect, test } from "bun:test";
import { resolveApiKey } from "../../src/utils/api-key.js";
import { setSessionApiKey, clearSessionApiKey } from "../../src/context.js";

// Run with `env -u ABACATE_PAY_API_KEY` — `src/config.ts` captures the global key
// at import time; with the env var set, the placeholder test wouldn't return null.

describe("resolveApiKey", () => {
  afterEach(() => clearSessionApiKey("sess_1"));

  test("non-placeholder param takes priority", () => {
    expect(resolveApiKey(undefined, "abc_real_secret")).toBe("abc_real_secret");
  });

  test("placeholder param is ignored", () => {
    expect(resolveApiKey(undefined, "api_key")).toBeNull();
  });

  test("falls back to the session key when there's no valid param", () => {
    setSessionApiKey("sess_1", "abc_session_secret");
    expect(resolveApiKey("sess_1", undefined)).toBe("abc_session_secret");
  });
});
