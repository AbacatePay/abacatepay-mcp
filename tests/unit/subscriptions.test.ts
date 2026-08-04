import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerSubscriptionTools } from "../../src/tools/subscriptions.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("getSubscription", () => {
  test("GET /subscriptions/get?id=", async () => {
    const tools = collectTools(registerSubscriptionTools);
    expect(tools.has("getSubscription")).toBe(true);
    const calls = stubFetch({ data: { id: "subs_1", status: "ACTIVE" } });
    const out = await tools.get("getSubscription")!.handler({ apiKey: KEY, id: "subs_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/subscriptions/get?id=subs_1");
    expect(calls[0].init.method).toBe("GET");
    expect(out.content[0].text).toContain("subs_1");
  });
});

describe("cancelSubscription", () => {
  test("POST /subscriptions/cancel with id", async () => {
    const tools = collectTools(registerSubscriptionTools);
    expect(tools.has("cancelSubscription")).toBe(true);
    const calls = stubFetch({ data: { id: "subs_1", status: "CANCELLED" } });
    const out = await tools.get("cancelSubscription")!.handler({ apiKey: KEY, id: "subs_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/subscriptions/cancel");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "subs_1" });
    expect(out.content[0].text).toContain("subs_1");
    expect(out.content[0].text).toContain("CANCELLED");
  });
});

describe("changeSubscriptionPlan", () => {
  test("POST /subscriptions/change-plan with id+productId+quantity", async () => {
    const tools = collectTools(registerSubscriptionTools);
    expect(tools.has("changeSubscriptionPlan")).toBe(true);
    const calls = stubFetch({ data: { id: "subs_1", productId: "prod_pro" } });
    const out = await tools.get("changeSubscriptionPlan")!.handler(
      { apiKey: KEY, id: "subs_1", productId: "prod_pro", quantity: 2 },
      {}
    );
    expect(out.content[0].text).toContain("prod_pro");
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/subscriptions/change-plan");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "subs_1", productId: "prod_pro", quantity: 2 });
  });

  test("items[] takes priority over productId/quantity", async () => {
    const tools = collectTools(registerSubscriptionTools);
    const calls = stubFetch({ data: { id: "subs_1" } });
    await tools.get("changeSubscriptionPlan")!.handler(
      { apiKey: KEY, id: "subs_1", items: [{ productId: "prod_a", quantity: 1 }] },
      {}
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      id: "subs_1",
      items: [{ productId: "prod_a", quantity: 1 }],
    });
  });
});

describe("recordSubscriptionUsage", () => {
  test("POST /subscriptions/record-usage with action add", async () => {
    const tools = collectTools(registerSubscriptionTools);
    expect(tools.has("recordSubscriptionUsage")).toBe(true);
    const calls = stubFetch({ data: { id: "usage_1" } });
    const out = await tools.get("recordSubscriptionUsage")!.handler(
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
    expect(out.content[0].text).toContain("usage_1");
  });

  test("action subtract is passed in the body", async () => {
    const tools = collectTools(registerSubscriptionTools);
    const calls = stubFetch({ data: { id: "usage_2" } });
    await tools.get("recordSubscriptionUsage")!.handler(
      { apiKey: KEY, id: "subs_1", productId: "prod_api", units: 5, action: "subtract" },
      {}
    );
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ action: "subtract" });
  });
});
