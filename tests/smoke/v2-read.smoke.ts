import { describe, expect, test } from "bun:test";
import { collectTools } from "../unit/helpers/harness.js";
import { registerV2CustomerTools } from "../../src/tools/v2/customers.js";

const ENABLED = process.env.ABACATE_PAY_SMOKE === "1";
const KEY = process.env.ABACATE_PAY_API_KEY;

describe.skipIf(!ENABLED)("smoke v2 (read-only, chave real)", () => {
  test("v2ListCustomers responde sem erro de auth", async () => {
    if (!KEY) throw new Error("Defina ABACATE_PAY_API_KEY (chave v2) para o smoke.");
    const tools = collectTools(registerV2CustomerTools);
    const out = await tools.get("v2ListCustomers")!.handler({ apiKey: KEY, limit: 1 }, {});
    expect(out.content[0].text).not.toContain("HTTP 401");
    expect(out.content[0].text).not.toContain("API key é obrigatória");
    expect(out.content[0].text).toMatch(/Nenhum cliente\.|^\d+\./);
  });
});
