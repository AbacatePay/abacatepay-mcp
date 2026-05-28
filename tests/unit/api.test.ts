import { afterEach, describe, expect, test } from "bun:test";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { makeAbacatePayRequest } from "../../src/http/api.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("makeAbacatePayRequest", () => {
  test("v1 → base /v1, v2 → base /v2", async () => {
    let calls = stubFetch({ ok: true });
    await makeAbacatePayRequest({ version: "v1", path: "/customer/list", apiKey: KEY, method: "GET" });
    expect(calls[0].url).toBe("https://api.abacatepay.com/v1/customer/list");

    calls = stubFetch({ ok: true });
    await makeAbacatePayRequest({ version: "v2", path: "/customers/list", apiKey: KEY, method: "GET" });
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/customers/list");
  });

  test("injeta Authorization Bearer", async () => {
    const calls = stubFetch({ ok: true });
    await makeAbacatePayRequest({ version: "v2", path: "/x", apiKey: KEY, method: "GET" });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  test("erro HTTP vira Error com status e detalhe", async () => {
    stubFetch({ error: "saldo insuficiente" }, 400);
    await expect(
      makeAbacatePayRequest({ version: "v2", path: "/x", apiKey: KEY, method: "GET" })
    ).rejects.toThrow("saldo insuficiente");
  });

  test("version mismatch ganha dica", async () => {
    stubFetch({ error: "version mismatch" }, 400);
    await expect(
      makeAbacatePayRequest({ version: "v1", path: "/x", apiKey: KEY, method: "GET" })
    ).rejects.toThrow(/chaves da API v1/);
  });

  test("sem chave → erro de API key obrigatória", async () => {
    stubFetch({ ok: true });
    await expect(
      makeAbacatePayRequest({ version: "v2", path: "/x", method: "GET" })
    ).rejects.toThrow(/API key é obrigatória/);
  });
});
