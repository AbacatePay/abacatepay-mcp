import { describe, expect, test } from "bun:test";
import { collectTools } from "../unit/helpers/harness.js";
import { registerCustomerTools } from "../../src/tools/customers.js";
import { registerStoreTools } from "../../src/tools/store.js";

const ENABLED = process.env.ABACATE_PAY_SMOKE === "1";
const KEY = process.env.ABACATE_PAY_API_KEY;

describe.skipIf(!ENABLED)("smoke (read-only, real v2 key)", () => {
  test("listCustomers responds without an auth error", async () => {
    if (!KEY) throw new Error("Set ABACATE_PAY_API_KEY (a v2 key) to run the smoke test.");
    const tools = collectTools(registerCustomerTools);
    const out = await tools.get("listCustomers")!.handler({ apiKey: KEY, limit: 1 }, {});
    expect(out.content[0].text).not.toContain("HTTP 401");
    expect(out.content[0].text).not.toContain("API key é obrigatória");
    expect(out.content[0].text).toMatch(/Nenhum cliente\.|^\d+\./);
  });

  test("getStore responds without an auth error (validates the /stores/get path)", async () => {
    if (!KEY) throw new Error("Set ABACATE_PAY_API_KEY (a v2 key) to run the smoke test.");
    const tools = collectTools(registerStoreTools);
    const out = await tools.get("getStore")!.handler({ apiKey: KEY }, {});
    expect(out.content[0].text).not.toContain("HTTP 401");
    expect(out.content[0].text).not.toContain("HTTP 404");
  });
});
