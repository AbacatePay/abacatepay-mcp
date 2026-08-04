import { describe, expect, test } from "bun:test";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "../../src/tools/shared.js";

describe("buildQuery", () => {
  test("omits undefined, null and empty string", () => {
    expect(buildQuery({ a: "x", b: undefined, c: null, d: "" })).toBe("?a=x");
  });
  test("empty string when nothing is left", () => {
    expect(buildQuery({ a: undefined })).toBe("");
  });
  test("encodes values and accepts numbers", () => {
    expect(buildQuery({ q: "a b", n: 10 })).toBe("?q=a+b&n=10");
  });
});

describe("paginationHint", () => {
  test("no pagination → empty", () => {
    expect(paginationHint(undefined)).toBe("");
  });
  test("hasMore+next → next-page hint", () => {
    expect(paginationHint({ hasMore: true, next: "cur_1" })).toContain('after="cur_1"');
  });
  test("before → previous-page hint", () => {
    expect(paginationHint({ before: "cur_0" })).toContain('before="cur_0"');
  });
});

describe("toolError", () => {
  test("Error → uses message", () => {
    expect(toolError(new Error("boom")).content[0].text).toBe("boom");
  });
  test("non-Error → default message", () => {
    expect(toolError(42).content[0].text).toBe("Erro desconhecido");
  });
});

describe("apiKeyParam", () => {
  test("description mentions ABACATE_PAY_API_KEY", () => {
    const d = apiKeyParam().description as string;
    expect(d).toContain("ABACATE_PAY_API_KEY");
  });
  test("is optional", () => {
    expect((apiKeyParam() as any)._def.type).toBe("optional");
  });
});
