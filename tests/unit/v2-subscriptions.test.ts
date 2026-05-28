import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerV2SubscriptionTools } from "../../src/tools/v2/subscriptions.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("v2CancelSubscription", () => {
  test("POST /subscriptions/cancel com id", async () => {
    const tools = collectTools(registerV2SubscriptionTools);
    expect(tools.has("v2CancelSubscription")).toBe(true);
    const calls = stubFetch({ data: { id: "subs_1", status: "CANCELLED" } });
    const out = await tools.get("v2CancelSubscription")!.handler({ apiKey: KEY, id: "subs_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/subscriptions/cancel");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "subs_1" });
    expect(out.content[0].text).toContain("subs_1");
    expect(out.content[0].text).toContain("CANCELLED");
  });
});

describe("v2ChangeSubscriptionPlan", () => {
  test("POST /subscriptions/change-plan com id+productId+quantity", async () => {
    const tools = collectTools(registerV2SubscriptionTools);
    expect(tools.has("v2ChangeSubscriptionPlan")).toBe(true);
    const calls = stubFetch({ data: { id: "subs_1", productId: "prod_pro" } });
    await tools.get("v2ChangeSubscriptionPlan")!.handler(
      { apiKey: KEY, id: "subs_1", productId: "prod_pro", quantity: 2 },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/subscriptions/change-plan");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "subs_1", productId: "prod_pro", quantity: 2 });
  });
});

describe("v2RecordSubscriptionUsage", () => {
  test("POST /subscriptions/record-usage com action add", async () => {
    const tools = collectTools(registerV2SubscriptionTools);
    expect(tools.has("v2RecordSubscriptionUsage")).toBe(true);
    const calls = stubFetch({ data: { id: "usage_1" } });
    await tools.get("v2RecordSubscriptionUsage")!.handler(
      { apiKey: KEY, id: "subs_1", productId: "prod_api", units: 50, action: "add" },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/subscriptions/record-usage");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      id: "subs_1",
      productId: "prod_api",
      units: 50,
      action: "add",
    });
  });
});
