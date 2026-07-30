import { describe, expect, test } from "bun:test";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "../../src/tools/shared.js";

describe("buildQuery", () => {
  test("omite undefined, null e string vazia", () => {
    expect(buildQuery({ a: "x", b: undefined, c: null, d: "" })).toBe("?a=x");
  });
  test("string vazia quando nada resta", () => {
    expect(buildQuery({ a: undefined })).toBe("");
  });
  test("encoda valores e aceita números", () => {
    expect(buildQuery({ q: "a b", n: 10 })).toBe("?q=a+b&n=10");
  });
});

describe("paginationHint", () => {
  test("sem paginação → vazio", () => {
    expect(paginationHint(undefined)).toBe("");
  });
  test("hasMore+next → dica de próxima página", () => {
    expect(paginationHint({ hasMore: true, next: "cur_1" })).toContain('after="cur_1"');
  });
  test("before → dica de página anterior", () => {
    expect(paginationHint({ before: "cur_0" })).toContain('before="cur_0"');
  });
});

describe("toolError", () => {
  test("Error → usa message", () => {
    expect(toolError(new Error("boom")).content[0].text).toBe("boom");
  });
  test("não-Error → mensagem padrão", () => {
    expect(toolError(42).content[0].text).toBe("Erro desconhecido");
  });
});

describe("apiKeyParam", () => {
  test("v1 tem descrição sem menção a v2", () => {
    const d = (apiKeyParam("v1") as any)._def.description as string;
    expect(d).toContain("ABACATE_PAY_API_KEY");
    expect(d).not.toContain("v2");
  });
  test("v2 menciona chave v2", () => {
    const d = (apiKeyParam("v2") as any)._def.description as string;
    expect(d).toContain("v2");
  });
});
