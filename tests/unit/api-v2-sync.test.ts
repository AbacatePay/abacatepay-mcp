import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { collectTools, type CollectedTool } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerBankStatementTools } from "../../src/tools/bank-statement.js";
import { registerCheckoutTools } from "../../src/tools/checkouts.js";
import { registerCouponTools } from "../../src/tools/coupons.js";
import { registerCustomerPortalTools } from "../../src/tools/customer-portal.js";
import { registerCustomerTools } from "../../src/tools/customers.js";
import { registerPaymentLinkTools } from "../../src/tools/payment-links.js";
import { registerProductTools } from "../../src/tools/products.js";
import { registerSubAccountTools } from "../../src/tools/sub-accounts.js";
import { registerSubscriptionTools } from "../../src/tools/subscriptions.js";
import { registerTransparentTools } from "../../src/tools/transparents.js";

const KEY = "abc_test_secret_123";
const BASE = "https://api.abacatepay.com/v2";
afterEach(() => restoreFetch());

/** Validates params the way the MCP server does before calling the handler. */
function accepts(tool: CollectedTool, params: Record<string, unknown>): boolean {
  return z.object(tool.schema as z.ZodRawShape).safeParse(params).success;
}

function tool(register: Parameters<typeof collectTools>[0], name: string): CollectedTool {
  const found = collectTools(register).get(name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found;
}

function body(call: { init: RequestInit }) {
  return JSON.parse(String(call.init.body));
}

describe("subscriptions", () => {
  test("createSubscription no longer offers interest, fine or dueDate (they require BOLETO)", async () => {
    const create = tool(registerSubscriptionTools, "createSubscription");
    for (const field of ["interest", "fine", "dueDate"]) expect(field in create.schema).toBe(false);

    const calls = stubFetch({ data: { id: "bill_1", url: "https://pay/bill_1", status: "PENDING" } });
    const out = await create.handler({ apiKey: KEY, items: [{ id: "prod_1", quantity: 1 }] }, {});
    expect(calls[0].url).toBe(`${BASE}/subscriptions/create`);
    expect(out.content[0].text).toContain("bill_1");
    expect(out.content[0].text).toContain('checkoutId="bill_1"');
  });

  test("listSubscriptions filters by checkoutId and only by ACTIVE or CANCELLED", async () => {
    const list = tool(registerSubscriptionTools, "listSubscriptions");
    expect(accepts(list, { status: "ACTIVE" })).toBe(true);
    expect(accepts(list, { status: "PAID" })).toBe(false);

    const calls = stubFetch({
      data: [
        {
          id: "subs_1",
          status: "ACTIVE",
          amount: 4990,
          method: "CARD",
          customerId: "cust_1",
          checkoutId: "bill_1",
          nextChargeAt: "2026-12-10",
        },
      ],
      pagination: { hasMore: false, next: null, before: null },
    });
    const out = await list.handler({ apiKey: KEY, status: "ACTIVE", checkoutId: "bill_1" }, {});
    expect(calls[0].url).toBe(`${BASE}/subscriptions/list?status=ACTIVE&checkoutId=bill_1`);
    expect(out.content[0].text).toContain("subs_1 — ACTIVE — R$ 49.90 — CARD — cliente cust_1 — checkout bill_1");
    expect(out.content[0].text).toContain("2026-12-10");
  });

  test("getSubscription no longer sends method", () => {
    expect("method" in tool(registerSubscriptionTools, "getSubscription").schema).toBe(false);
  });

  test("getSubscriptionCheckout reads the bill_ returned by createSubscription", async () => {
    const calls = stubFetch({ data: { id: "bill_1" } });
    await tool(registerSubscriptionTools, "getSubscriptionCheckout").handler({ apiKey: KEY, id: "bill_1" }, {});
    expect(calls[0].url).toBe(`${BASE}/subscriptions/checkouts/get?id=bill_1`);
    expect(calls[0].init.method).toBe("GET");
  });

  test("listSubscriptionCheckouts", async () => {
    const calls = stubFetch({
      data: [{ id: "bill_1", status: "PENDING", amount: 4990, url: "https://pay/bill_1" }],
      pagination: { hasMore: false, next: null, before: null },
    });
    const out = await tool(registerSubscriptionTools, "listSubscriptionCheckouts").handler(
      { apiKey: KEY, status: "PENDING", method: "CARD" },
      {}
    );
    expect(calls[0].url).toBe(`${BASE}/subscriptions/checkouts/list?status=PENDING&method=CARD`);
    expect(out.content[0].text).toContain("bill_1 — PENDING — R$ 49.90");
  });

  test("deleteSubscriptionCheckout sends the id in the query", async () => {
    const calls = stubFetch({ data: { id: "bill_1" } });
    await tool(registerSubscriptionTools, "deleteSubscriptionCheckout").handler({ apiKey: KEY, id: "bill_1" }, {});
    expect(calls[0].url).toBe(`${BASE}/subscriptions/checkouts/delete?id=bill_1`);
    expect(calls[0].init.method).toBe("POST");
  });
});

describe("checkouts and payment links", () => {
  test("createCheckout accepts the wallets and card.passFeesToCustomer", async () => {
    const create = tool(registerCheckoutTools, "createCheckout");
    expect(accepts(create, { items: [{ id: "prod_1" }], methods: ["CARD", "APPLE_PAY", "GOOGLE_PAY"] })).toBe(true);

    const calls = stubFetch({ data: { id: "bill_1", url: "u", status: "PENDING", amount: 100 } });
    await create.handler(
      { apiKey: KEY, items: [{ id: "prod_1", quantity: 1 }], card: { maxInstallments: 3, passFeesToCustomer: true } },
      {}
    );
    expect(body(calls[0]).card).toEqual({ maxInstallments: 3, passFeesToCustomer: true });
  });

  test("listCheckouts uses the checkout statuses, not the payment intent ones", () => {
    const list = tool(registerCheckoutTools, "listCheckouts");
    expect(accepts(list, { status: "ACTIVE" })).toBe(true);
    expect(accepts(list, { status: "APPROVED" })).toBe(false);
    expect(accepts(list, { method: "APPLE_PAY" })).toBe(true);
  });

  test("createPaymentLink takes no customerId and no wallets", async () => {
    const create = tool(registerPaymentLinkTools, "createPaymentLink");
    expect("customerId" in create.schema).toBe(false);
    expect(accepts(create, { items: [{ id: "prod_1" }], methods: ["APPLE_PAY"] })).toBe(false);

    const calls = stubFetch({ data: { id: "bill_2", url: "u", status: "ACTIVE" } });
    await create.handler(
      { apiKey: KEY, items: [{ id: "prod_1", quantity: 1 }], card: { maxInstallments: 6, passFeesToCustomer: true } },
      {}
    );
    expect(body(calls[0]).card).toEqual({ maxInstallments: 6, passFeesToCustomer: true });
  });
});

describe("customers, products and coupons", () => {
  test("createCustomer sends the address and only accepts text metadata", async () => {
    const create = tool(registerCustomerTools, "createCustomer");
    expect(accepts(create, { email: "a@b.com", metadata: { plan: 1 } })).toBe(false);
    expect(accepts(create, { email: "a@b.com", metadata: { plan: "pro" } })).toBe(true);

    const address = {
      zipCode: "01310100",
      street: "Av. Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    };
    const calls = stubFetch({ data: { id: "cust_1", email: "a@b.com" } });
    await create.handler({ apiKey: KEY, email: "a@b.com", address }, {});
    expect(body(calls[0])).toEqual({ email: "a@b.com", address });
  });

  test("createProduct sends imageUrl and no longer offers image", async () => {
    const create = tool(registerProductTools, "createProduct");
    expect("image" in create.schema).toBe(false);

    const calls = stubFetch({ data: { id: "prod_1", name: "P", price: 100 } });
    await create.handler(
      { apiKey: KEY, externalId: "p1", name: "P", price: 100, imageUrl: "https://img.example/p.png" },
      {}
    );
    expect(body(calls[0]).imageUrl).toBe("https://img.example/p.png");
  });

  test("getCoupon requires the id", () => {
    const get = tool(registerCouponTools, "getCoupon");
    expect(accepts(get, {})).toBe(false);
    expect(accepts(get, { id: "BEMVINDO" })).toBe(true);
  });
});

describe("transparents", () => {
  test("createTransparentPix sends splits and ensureSameTaxId inside data", async () => {
    const calls = stubFetch({ data: { id: "pix_char_1", status: "PENDING", brCode: "000", brCodeBase64: "x" } });
    await tool(registerTransparentTools, "createTransparentPix").handler(
      {
        apiKey: KEY,
        amount: 10000,
        ensureSameTaxId: true,
        customer: { name: "Maria", cellphone: "11999999999", email: "m@x.com", taxId: "52998224725" },
        splits: [{ subAccountId: "sacc_1", amount: 7000 }],
      },
      {}
    );
    const sent = body(calls[0]);
    expect(sent.method).toBe("PIX");
    expect(sent.data.ensureSameTaxId).toBe(true);
    expect(sent.data.splits).toEqual([{ subAccountId: "sacc_1", amount: 7000 }]);
  });

  test("createTransparentPix rejects a split that is not a sub account", () => {
    const create = tool(registerTransparentTools, "createTransparentPix");
    expect(accepts(create, { amount: 10000, splits: [{ subAccountId: "store_1", amount: 1 }] })).toBe(false);
  });

  test("createTransparentBoleto: minimum of 300 cents and the payer address", () => {
    const create = tool(registerTransparentTools, "createTransparentBoleto");
    const customer = {
      name: "Maria",
      taxId: "52998224725",
      address: {
        zipCode: "01310100",
        street: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
      },
    };
    expect(accepts(create, { amount: 299, customer })).toBe(false);
    expect(accepts(create, { amount: 300, customer })).toBe(true);
  });

  test("simulateTransparentPixPayment sends no metadata", async () => {
    const simulate = tool(registerTransparentTools, "simulateTransparentPixPayment");
    expect("metadata" in simulate.schema).toBe(false);

    const calls = stubFetch({ data: { id: "pix_char_1", status: "PAID" } });
    await simulate.handler({ apiKey: KEY, id: "pix_char_1" }, {});
    expect(calls[0].url).toBe(`${BASE}/transparents/simulate-payment?id=pix_char_1`);
    expect(body(calls[0])).toEqual({});
  });
});

describe("customer portal", () => {
  test("createCustomerPortal", async () => {
    const calls = stubFetch({ data: { id: "cpl_1", url: "https://portal/cpl_1" } });
    const out = await tool(registerCustomerPortalTools, "createCustomerPortal").handler(
      { apiKey: KEY, customerId: "cust_1", checkoutId: "bill_1" },
      {}
    );
    expect(calls[0].url).toBe(`${BASE}/customer-portal/create`);
    expect(body(calls[0])).toEqual({ customerId: "cust_1", checkoutId: "bill_1" });
    expect(out.content[0].text).toContain("https://portal/cpl_1");
  });
});

describe("sub accounts", () => {
  const subAccount = {
    id: "sacc_1",
    name: "João",
    taxId: "11144477735",
    externalId: "vendedor-42",
    balance: { available: 7000, blocked: 0 },
  };

  test("createSubAccount", async () => {
    const calls = stubFetch({ data: subAccount });
    const out = await tool(registerSubAccountTools, "createSubAccount").handler(
      { apiKey: KEY, name: "João", taxId: "111.444.777-35", externalId: "vendedor-42" },
      {}
    );
    expect(calls[0].url).toBe(`${BASE}/sub-accounts/create`);
    expect(body(calls[0])).toEqual({ name: "João", taxId: "111.444.777-35", externalId: "vendedor-42" });
    expect(out.content[0].text).toContain("disponível R$ 70.00");
  });

  test("getSubAccount and listSubAccounts", async () => {
    let calls = stubFetch({ data: subAccount });
    await tool(registerSubAccountTools, "getSubAccount").handler({ apiKey: KEY, id: "sacc_1" }, {});
    expect(calls[0].url).toBe(`${BASE}/sub-accounts/get?id=sacc_1`);

    restoreFetch();
    calls = stubFetch({ data: [subAccount], pagination: { hasMore: false, next: null, before: null } });
    const out = await tool(registerSubAccountTools, "listSubAccounts").handler(
      { apiKey: KEY, externalId: "vendedor-42" },
      {}
    );
    expect(calls[0].url).toBe(`${BASE}/sub-accounts/list?externalId=vendedor-42`);
    expect(out.content[0].text).toContain("sacc_1 — João");
  });

  test("withdrawSubAccount sends no PIX key: it always goes to the holder's CPF/CNPJ", async () => {
    const withdraw = tool(registerSubAccountTools, "withdrawSubAccount");
    expect("pix" in withdraw.schema).toBe(false);
    expect(accepts(withdraw, { id: "cust_1", amount: 100, externalId: "r1" })).toBe(false);
    expect(accepts(withdraw, { id: "sacc_1", amount: 99, externalId: "r1" })).toBe(false);

    const calls = stubFetch({
      data: { id: "tran_1", subAccountId: "sacc_1", status: "COMPLETE", amount: 7000, externalId: "repasse-1" },
    });
    await withdraw.handler({ apiKey: KEY, id: "sacc_1", amount: 7000, externalId: "repasse-1" }, {});
    expect(calls[0].url).toBe(`${BASE}/sub-accounts/withdraw`);
    expect(body(calls[0])).toEqual({ id: "sacc_1", amount: 7000, externalId: "repasse-1" });
  });
});

describe("listBankStatement", () => {
  test("lists the movements of each transaction", async () => {
    const calls = stubFetch({
      data: [
        {
          id: "tran_1",
          createdAt: "2026-11-10T12:00:00.000Z",
          checkoutId: "bill_1",
          paymentIntentId: null,
          referenceId: null,
          movements: [
            { amount: 10000, description: "Pagamento PIX", balanceEffect: "credit" },
            { amount: 80, description: "Taxa", balanceEffect: "debit" },
          ],
        },
      ],
      pagination: { hasMore: true, next: "tran_0", before: null },
    });
    const out = await tool(registerBankStatementTools, "listBankStatement").handler(
      { apiKey: KEY, method: "PIX", limit: 1 },
      {}
    );
    expect(calls[0].url).toBe(`${BASE}/bank-statement/list?limit=1&method=PIX`);
    expect(out.content[0].text).toContain("tran_1 (bill_1) — +R$ 100.00 Pagamento PIX; -R$ 0.80 Taxa");
    expect(out.content[0].text).toContain('after="tran_0"');
  });
});
