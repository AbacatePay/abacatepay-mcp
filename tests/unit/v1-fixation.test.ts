import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerCustomerTools } from "../../src/tools/customer.js";

const KEY = "abc_test_secret_123";

afterEach(() => restoreFetch());

describe("v1 createCustomer (fixação)", () => {
  test("nome da tool e URL v1", async () => {
    const tools = collectTools(registerCustomerTools);
    expect(tools.has("createCustomer")).toBe(true);
    expect(tools.has("listCustomers")).toBe(true);

    const calls = stubFetch({ data: { id: "cust_1" } });
    const out = await tools.get("createCustomer")!.handler(
      { apiKey: KEY, name: "Ana", cellphone: "(11) 4002-8922", email: "a@b.com", taxId: "123" },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v1/customer/create");
    expect(out.content[0].text).toContain("Cliente criado com sucesso!");
    expect(out.content[0].text).toContain("ID: cust_1");
  });

  test("erro mantém prefixo contextual da v1", async () => {
    const tools = collectTools(registerCustomerTools);
    stubFetch({ error: "boom" }, 400);
    const out = await tools.get("createCustomer")!.handler(
      { apiKey: KEY, name: "Ana", cellphone: "x", email: "a@b.com", taxId: "123" },
      {}
    );
    expect(out.content[0].text).toContain("Falha ao criar cliente:");
  });
});
