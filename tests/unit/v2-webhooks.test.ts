import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerV2WebhookTools } from "../../src/tools/v2/webhooks.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

describe("v2CreateWebhook", () => {
  test("POST /webhooks/create com payload completo", async () => {
    const tools = collectTools(registerV2WebhookTools);
    expect(tools.has("v2CreateWebhook")).toBe(true);
    const calls = stubFetch({ data: { id: "webh_1", name: "Pagamentos", endpoint: "https://x.com/wh" } });
    const out = await tools.get("v2CreateWebhook")!.handler(
      {
        apiKey: KEY,
        name: "Pagamentos",
        endpoint: "https://x.com/wh",
        secret: "s3cr3t",
        events: ["checkout.completed", "subscription.renewed"],
      },
      {}
    );
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/create");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Pagamentos",
      endpoint: "https://x.com/wh",
      secret: "s3cr3t",
      events: ["checkout.completed", "subscription.renewed"],
    });
    expect(out.content[0].text).toContain("webh_1");
  });
});

describe("v2ListWebhooks", () => {
  test("GET /webhooks/list com query e paginação", async () => {
    const tools = collectTools(registerV2WebhookTools);
    const calls = stubFetch({
      data: [{ id: "webh_1", name: "Pag", endpoint: "https://x.com/wh" }],
      pagination: { hasMore: true, next: "cur_2" },
    });
    const out = await tools.get("v2ListWebhooks")!.handler({ apiKey: KEY, limit: 10, search: "pag" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/list?limit=10&search=pag");
    expect(calls[0].init.method).toBe("GET");
    expect(out.content[0].text).toContain("webh_1");
    expect(out.content[0].text).toContain('after="cur_2"');
  });
});

describe("v2GetWebhook", () => {
  test("GET /webhooks/get?id=", async () => {
    const tools = collectTools(registerV2WebhookTools);
    const calls = stubFetch({ data: { id: "webh_1" } });
    await tools.get("v2GetWebhook")!.handler({ apiKey: KEY, id: "webh_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/get?id=webh_1");
  });
});

describe("v2DeleteWebhook", () => {
  test("POST /webhooks/delete com id", async () => {
    const tools = collectTools(registerV2WebhookTools);
    const calls = stubFetch({ data: { id: "webh_1" } });
    const out = await tools.get("v2DeleteWebhook")!.handler({ apiKey: KEY, id: "webh_1" }, {});
    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/webhooks/delete");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ id: "webh_1" });
    expect(out.content[0].text).toContain("webh_1");
  });
});
