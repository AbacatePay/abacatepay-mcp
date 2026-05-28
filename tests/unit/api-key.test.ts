import { describe, expect, test } from "bun:test";
import { resolveApiKey } from "../../src/utils/api-key.js";
import { setSessionApiKey, clearSessionApiKey } from "../../src/context.js";

describe("resolveApiKey", () => {
  test("param não-placeholder tem prioridade", () => {
    expect(resolveApiKey(undefined, "abc_real_secret")).toBe("abc_real_secret");
  });

  test("param placeholder é ignorado", () => {
    expect(resolveApiKey(undefined, "api_key")).toBeNull();
  });

  test("cai para a chave de sessão quando não há param válido", () => {
    setSessionApiKey("sess_1", "abc_session_secret");
    expect(resolveApiKey("sess_1", undefined)).toBe("abc_session_secret");
    clearSessionApiKey("sess_1");
  });
});
