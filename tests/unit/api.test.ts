import { afterEach, describe, expect, test } from "bun:test";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { makeAbacatePayRequest } from "../../src/http/api.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("makeAbacatePayRequest", () => {
  test("uses the /v2 base", async () => {
    const calls = stubFetch({ ok: true });
    await makeAbacatePayRequest({ path: "/customers/list", apiKey: KEY, method: "GET" });
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/customers/list");
  });

  test("injects Authorization Bearer", async () => {
    const calls = stubFetch({ ok: true });
    await makeAbacatePayRequest({ path: "/x", apiKey: KEY, method: "GET" });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  test("HTTP error becomes an Error with status and detail", async () => {
    stubFetch({ error: "insufficient funds" }, 400);
    await expect(
      makeAbacatePayRequest({ path: "/x", apiKey: KEY, method: "GET" })
    ).rejects.toThrow("insufficient funds");
  });

  test("no key → required API key error", async () => {
    stubFetch({ ok: true });
    await expect(
      makeAbacatePayRequest({ path: "/x", method: "GET" })
    ).rejects.toThrow(/API key é obrigatória/);
  });
});
