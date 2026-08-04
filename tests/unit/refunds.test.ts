import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerCheckoutTools } from "../../src/tools/checkouts.js";
import { registerPaymentLinkTools } from "../../src/tools/payment-links.js";
import { registerTransparentTools } from "../../src/tools/transparents.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

// Real refund response shape is { id, status, amount, reason, originalId, createdAt } — no `refundPublicId` field.

describe("refundCheckout", () => {
  test("POST /checkouts/refund with id+reason, reads the id field from the response", async () => {
    const tools = collectTools(registerCheckoutTools);
    expect(tools.has("refundCheckout")).toBe(true);
    const calls = stubFetch({ data: { id: "tran_refund789", status: "REFUNDED" } });
    const out = await tools.get("refundCheckout")!.handler(
      { apiKey: KEY, id: "bill_abc", reason: "cancelado" },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/checkouts/refund");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "bill_abc", reason: "cancelado" });
    expect(out.content[0].text).toContain("tran_refund789");
  });
  test("omits reason when absent", async () => {
    const tools = collectTools(registerCheckoutTools);
    const calls = stubFetch({ data: { id: "tran_x", status: "REFUNDED" } });
    await tools.get("refundCheckout")!.handler({ apiKey: KEY, id: "char_1" }, {});
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "char_1" });
  });
});

describe("refundPaymentLink", () => {
  test("POST /payment-links/refund", async () => {
    const tools = collectTools(registerPaymentLinkTools);
    expect(tools.has("refundPaymentLink")).toBe(true);
    const calls = stubFetch({ data: { id: "tran_pl", status: "REFUNDED" } });
    const out = await tools.get("refundPaymentLink")!.handler({ apiKey: KEY, id: "char_pl" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/payment-links/refund");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "char_pl" });
    expect(out.content[0].text).toContain("tran_pl");
  });
});

describe("refundTransparent", () => {
  test("POST /transparents/refund", async () => {
    const tools = collectTools(registerTransparentTools);
    expect(tools.has("refundTransparent")).toBe(true);
    const calls = stubFetch({ data: { id: "tran_tp", status: "REFUNDED" } });
    const out = await tools.get("refundTransparent")!.handler({ apiKey: KEY, id: "pix_char_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/transparents/refund");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "pix_char_1" });
    expect(out.content[0].text).toContain("tran_tp");
  });
});
