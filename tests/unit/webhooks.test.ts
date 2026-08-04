import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerWebhookTools } from "../../src/tools/webhooks.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("createWebhook", () => {
  test("POST /webhooks/create with a full payload", async () => {
    const tools = collectTools(registerWebhookTools);
    expect(tools.has("createWebhook")).toBe(true);
    const calls = stubFetch({ data: { id: "webh_1", name: "Pagamentos", endpoint: "https://x.com/wh" } });
    const out = await tools.get("createWebhook")!.handler(
      {
        apiKey: KEY,
        name: "Pagamentos",
        endpoint: "https://x.com/wh",
        secret: "s3cr3t",
        events: ["checkout.completed", "subscription.plan_changed"],
      },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/create");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Pagamentos",
      endpoint: "https://x.com/wh",
      secret: "s3cr3t",
      events: ["checkout.completed", "subscription.plan_changed"],
    });
    expect(out.content[0].text).toContain("webh_1");
  });
});

describe("listWebhooks", () => {
  test("GET /webhooks/list with query and pagination", async () => {
    const tools = collectTools(registerWebhookTools);
    const calls = stubFetch({
      data: [{ id: "webh_1", name: "Pag", endpoint: "https://x.com/wh" }],
      pagination: { hasMore: true, next: "cur_2" },
    });
    const out = await tools.get("listWebhooks")!.handler({ apiKey: KEY, limit: 10, search: "pag" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/list?limit=10&search=pag");
    expect(calls[0].init.method).toBe("GET");
    expect(out.content[0].text).toContain("webh_1");
    expect(out.content[0].text).toContain('after="cur_2"');
  });
});

describe("getWebhook", () => {
  test("GET /webhooks/get?id=", async () => {
    const tools = collectTools(registerWebhookTools);
    const calls = stubFetch({ data: { id: "webh_1" } });
    const out = await tools.get("getWebhook")!.handler({ apiKey: KEY, id: "webh_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/get?id=webh_1");
    expect(calls[0].init.method).toBe("GET");
    expect(out.content[0].text).toContain("webh_1");
  });
});

describe("deleteWebhook", () => {
  test("POST /webhooks/delete?id= (id goes in the query, not the body)", async () => {
    const tools = collectTools(registerWebhookTools);
    const calls = stubFetch({ data: { id: "webh_1" } });
    const out = await tools.get("deleteWebhook")!.handler({ apiKey: KEY, id: "webh_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/delete?id=webh_1");
    expect(calls[0].init.method).toBe("POST");
    expect(out.content[0].text).toContain("webh_1");
  });
});
