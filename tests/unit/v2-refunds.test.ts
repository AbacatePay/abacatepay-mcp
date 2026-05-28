import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerV2CheckoutTools } from "../../src/tools/v2/checkouts.js";
import { registerV2PaymentLinkTools } from "../../src/tools/v2/payment-links.js";
import { registerV2TransparentTools } from "../../src/tools/v2/transparents.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("v2RefundCheckout", () => {
  test("POST /checkouts/refund com id+reason e refundPublicId na saída", async () => {
    const tools = collectTools(registerV2CheckoutTools);
    expect(tools.has("v2RefundCheckout")).toBe(true);
    const calls = stubFetch({ data: { refundPublicId: "tran_refund789" } });
    const out = await tools.get("v2RefundCheckout")!.handler(
      { apiKey: KEY, id: "bill_abc", reason: "cancelado" },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/checkouts/refund");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "bill_abc", reason: "cancelado" });
    expect(out.content[0].text).toContain("tran_refund789");
  });
  test("omite reason quando ausente", async () => {
    const tools = collectTools(registerV2CheckoutTools);
    const calls = stubFetch({ data: { refundPublicId: "tran_x" } });
    await tools.get("v2RefundCheckout")!.handler({ apiKey: KEY, id: "char_1" }, {});
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "char_1" });
  });
});

describe("v2RefundPaymentLink", () => {
  test("POST /payment-links/refund", async () => {
    const tools = collectTools(registerV2PaymentLinkTools);
    expect(tools.has("v2RefundPaymentLink")).toBe(true);
    const calls = stubFetch({ data: { refundPublicId: "tran_pl" } });
    const out = await tools.get("v2RefundPaymentLink")!.handler({ apiKey: KEY, id: "bill_pl" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/payment-links/refund");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "bill_pl" });
    expect(out.content[0].text).toContain("tran_pl");
  });
});

describe("v2RefundTransparentPix", () => {
  test("POST /transparents/refund", async () => {
    const tools = collectTools(registerV2TransparentTools);
    expect(tools.has("v2RefundTransparentPix")).toBe(true);
    const calls = stubFetch({ data: { refundPublicId: "tran_tp" } });
    const out = await tools.get("v2RefundTransparentPix")!.handler({ apiKey: KEY, id: "pix_char_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/transparents/refund");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "pix_char_1" });
    expect(out.content[0].text).toContain("tran_tp");
  });
});
