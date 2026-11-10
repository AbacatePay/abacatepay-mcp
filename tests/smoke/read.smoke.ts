import { describe, expect, test } from "bun:test";
import { collectTools } from "../unit/helpers/harness.js";
import { registerBankStatementTools } from "../../src/tools/bank-statement.js";
import { registerCustomerTools } from "../../src/tools/customers.js";
import { registerStoreTools } from "../../src/tools/store.js";
import { registerSubAccountTools } from "../../src/tools/sub-accounts.js";
import { registerSubscriptionTools } from "../../src/tools/subscriptions.js";

const ENABLED = process.env.ABACATE_PAY_SMOKE === "1";
const KEY = process.env.ABACATE_PAY_API_KEY;

function requireKey(): string {
  if (!KEY) throw new Error("Set ABACATE_PAY_API_KEY (a v2 key) to run the smoke test.");
  return KEY;
}

/** The route exists, the key works and the API accepted the params (no 401, 404 or 422). */
function expectAccepted(text: string) {
  expect(text).not.toContain("API key é obrigatória");
  expect(text).not.toMatch(/^HTTP (401|404|422)/);
}

describe.skipIf(!ENABLED)("smoke (read-only, real v2 key)", () => {
  test("listCustomers responds without an auth error", async () => {
    const tools = collectTools(registerCustomerTools);
    const out = await tools.get("listCustomers")!.handler({ apiKey: requireKey(), limit: 1 }, {});
    expect(out.content[0].text).not.toContain("HTTP 401");
    expect(out.content[0].text).not.toContain("API key é obrigatória");
    expect(out.content[0].text).toMatch(/Nenhum cliente\.|^\d+\./);
  });

  test("getStore responds without an auth error (validates the /stores/get path)", async () => {
    const tools = collectTools(registerStoreTools);
    const out = await tools.get("getStore")!.handler({ apiKey: requireKey() }, {});
    expect(out.content[0].text).not.toContain("HTTP 401");
    expect(out.content[0].text).not.toContain("HTTP 404");
  });

  test("listSubscriptions accepts status and checkoutId", async () => {
    const tools = collectTools(registerSubscriptionTools);
    const out = await tools.get("listSubscriptions")!.handler(
      { apiKey: requireKey(), limit: 1, status: "ACTIVE", checkoutId: "bill_smoke" },
      {}
    );
    expectAccepted(out.content[0].text);
    expect(out.content[0].text).toMatch(/Nenhuma\.|^\d+\./);
  });

  test("listSubscriptionCheckouts", async () => {
    const tools = collectTools(registerSubscriptionTools);
    const out = await tools.get("listSubscriptionCheckouts")!.handler({ apiKey: requireKey(), limit: 1 }, {});
    expectAccepted(out.content[0].text);
    expect(out.content[0].text).toMatch(/Nenhum checkout de assinatura\.|^\d+\./);
  });

  test("listBankStatement", async () => {
    const tools = collectTools(registerBankStatementTools);
    const out = await tools.get("listBankStatement")!.handler({ apiKey: requireKey(), limit: 1 }, {});
    expectAccepted(out.content[0].text);
    expect(out.content[0].text).toMatch(/Nenhuma transação\.|^\d+\./);
  });

  test("listSubAccounts (a store without the feature answers with an error, not a 404)", async () => {
    const tools = collectTools(registerSubAccountTools);
    const out = await tools.get("listSubAccounts")!.handler({ apiKey: requireKey(), limit: 1 }, {});
    expectAccepted(out.content[0].text);
  });
});
