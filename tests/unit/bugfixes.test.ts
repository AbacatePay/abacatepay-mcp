import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerPayoutTools } from "../../src/tools/payouts.js";
import { registerStoreTools } from "../../src/tools/store.js";
import { registerCheckoutTools } from "../../src/tools/checkouts.js";
import { registerPaymentLinkTools } from "../../src/tools/payment-links.js";
import { registerTransparentTools } from "../../src/tools/transparents.js";
import { registerPixSendTools } from "../../src/tools/pix-send.js";
import { registerCouponTools } from "../../src/tools/coupons.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("createPayout (regression: pix key was never sent)", () => {
  test("body includes pix.type/pix.key", async () => {
    const tools = collectTools(registerPayoutTools);
    const calls = stubFetch({ data: { id: "pay_1", status: "PENDING", amount: 5000 } });
    await tools.get("createPayout")!.handler(
      { apiKey: KEY, amount: 5000, pix: { type: "CPF", key: "12345678901" } },
      {}
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      amount: 5000,
      pix: { type: "CPF", key: "12345678901" },
    });
  });
});

describe("getStore (regression: was calling /store/get, singular)", () => {
  test("GET /stores/get", async () => {
    const tools = collectTools(registerStoreTools);
    const calls = stubFetch({ data: { id: "store_1", name: "Loja", balance: { available: 0 } } });
    await tools.get("getStore")!.handler({ apiKey: KEY }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/stores/get");
  });
});

describe("listStores (new)", () => {
  test("GET /stores/list", async () => {
    const tools = collectTools(registerStoreTools);
    expect(tools.has("listStores")).toBe(true);
    const calls = stubFetch({ data: [{ id: "store_1", name: "Loja" }] });
    await tools.get("listStores")!.handler({ apiKey: KEY }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/stores/list");
  });
});

describe("deleteCheckout / deletePaymentLink (new)", () => {
  test("POST /checkouts/delete?id=", async () => {
    const tools = collectTools(registerCheckoutTools);
    expect(tools.has("deleteCheckout")).toBe(true);
    const calls = stubFetch({ data: { id: "bill_1" } });
    await tools.get("deleteCheckout")!.handler({ apiKey: KEY, id: "bill_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/checkouts/delete?id=bill_1");
    expect(calls[0].init.method).toBe("POST");
  });

  test("POST /payment-links/delete?id=", async () => {
    const tools = collectTools(registerPaymentLinkTools);
    expect(tools.has("deletePaymentLink")).toBe(true);
    const calls = stubFetch({ data: { id: "bill_2" } });
    await tools.get("deletePaymentLink")!.handler({ apiKey: KEY, id: "bill_2" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/payment-links/delete?id=bill_2");
    expect(calls[0].init.method).toBe("POST");
  });
});

describe("createTransparentBoleto (new)", () => {
  test("POST /transparents/create with method BOLETO and required customer", async () => {
    const tools = collectTools(registerTransparentTools);
    expect(tools.has("createTransparentBoleto")).toBe(true);
    const calls = stubFetch({ data: { id: "bol_1", status: "PENDING", url: "https://x/pay/bol_1/boleto", barCode: "123" } });
    await tools.get("createTransparentBoleto")!.handler(
      { apiKey: KEY, amount: 1000, customer: { name: "Ana", taxId: "123" } },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/transparents/create");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      method: "BOLETO",
      data: { amount: 1000, customer: { name: "Ana", taxId: "123" } },
    });
  });
});

describe("getTransparent (new)", () => {
  test("GET /transparents/get?id=", async () => {
    const tools = collectTools(registerTransparentTools);
    expect(tools.has("getTransparent")).toBe(true);
    const calls = stubFetch({ data: { id: "pix_1", status: "PENDING" } });
    await tools.get("getTransparent")!.handler({ apiKey: KEY, id: "pix_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/transparents/get?id=pix_1");
  });
});

describe("getPixTransaction / listPixTransactions (regression: id is required, no pagination)", () => {
  test("GET /pix/get?id=", async () => {
    const tools = collectTools(registerPixSendTools);
    const calls = stubFetch({ data: { id: "tran_1", status: "COMPLETE" } });
    await tools.get("getPixTransaction")!.handler({ apiKey: KEY, id: "tran_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/pix/get?id=tran_1");
  });

  test("GET /pix/list?id= without pagination params", async () => {
    const tools = collectTools(registerPixSendTools);
    const calls = stubFetch({ data: [{ id: "tran_1", status: "COMPLETE" }] });
    await tools.get("listPixTransactions")!.handler({ apiKey: KEY, id: "tran_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/pix/list?id=tran_1");
  });
});

describe("createCoupon (regression: API requires maxRedeems, was optional/omitted)", () => {
  test("omitted → sends maxRedeems: -1 by default", async () => {
    const tools = collectTools(registerCouponTools);
    const calls = stubFetch({ data: { id: "coup_1", status: "ACTIVE" } });
    await tools.get("createCoupon")!.handler(
      { apiKey: KEY, code: "TEST10", discountKind: "PERCENTAGE", discount: 10 },
      {}
    );
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ maxRedeems: -1 });
  });

  test("provided → respects the passed value", async () => {
    const tools = collectTools(registerCouponTools);
    const calls = stubFetch({ data: { id: "coup_2", status: "ACTIVE" } });
    await tools.get("createCoupon")!.handler(
      { apiKey: KEY, code: "TEST10", discountKind: "PERCENTAGE", discount: 10, maxRedeems: 50 },
      {}
    );
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ maxRedeems: 50 });
  });
});

describe("toggleCoupon (regression: id must be in body, not query)", () => {
  test("POST /coupons/toggle with id in the body", async () => {
    const tools = collectTools(registerCouponTools);
    const calls = stubFetch({ data: { id: "coup_1", status: "DISABLED" } });
    await tools.get("toggleCoupon")!.handler({ apiKey: KEY, id: "coup_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/coupons/toggle");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "coup_1" });
  });
});
