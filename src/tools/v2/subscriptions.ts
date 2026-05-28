import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../../http/api.js";
import { buildQuery, paginationHint, toolError, v2ApiKey } from "./helpers.js";

const subItem = z
  .object({
    id: z.string(),
    quantity: z.number().min(1),
  })
  .strict();

export function registerV2SubscriptionTools(server: McpServer) {
  server.tool(
    "v2CreateSubscriptionCheckout",
    "Cria checkout de assinatura — exatamente 1 item; produto com cycle (API v2).",
    {
      apiKey: v2ApiKey,
      items: z.array(subItem).min(1).max(1),
      methods: z.array(z.enum(["PIX", "CARD"])).min(1).optional(),
      returnUrl: z.string().url().optional(),
      completionUrl: z.string().url().optional(),
      customerId: z.string().optional(),
      coupons: z.array(z.string()).max(50).optional(),
      externalId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { items: p.items };
        if (p.methods) body.methods = p.methods;
        if (p.returnUrl) body.returnUrl = p.returnUrl;
        if (p.completionUrl) body.completionUrl = p.completionUrl;
        if (p.customerId) body.customerId = p.customerId;
        if (p.coupons?.length) body.coupons = p.coupons;
        if (p.externalId) body.externalId = p.externalId;
        if (p.metadata) body.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: "/subscriptions/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [{ type: "text", text: `Assinatura checkout: ${d.id}\n${d.url}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2ListSubscriptionCheckouts",
    "Lista checkouts de assinatura (API v2).",
    {
      apiKey: v2ApiKey,
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      externalId: z.string().optional(),
      status: z.enum(["PENDING", "EXPIRED", "CANCELLED", "PAID", "REFUNDED"]).optional(),
      email: z.string().optional(),
      taxId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: `/subscriptions/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            externalId: p.externalId,
            status: p.status,
            email: p.email,
            taxId: p.taxId,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((b: any, i: number) => `${i + 1}. ${b.id} — ${b.status}`).join("\n") || "Nenhum.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2CancelSubscription",
    "Cancela imediatamente uma assinatura ativa (API v2 — chave v2). Irreversível.",
    {
      apiKey: v2ApiKey,
      id: z.string().describe("ID da assinatura (subs_...)."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: "/subscriptions/cancel",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ id: p.id }),
        });
        const d = res.data;
        return {
          content: [{ type: "text", text: `Assinatura cancelada: ${d?.id} — ${d?.status}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2ChangeSubscriptionPlan",
    "Agenda alteração do produto principal de uma assinatura para o próximo ciclo (API v2 — chave v2). Produto deve ter ciclo de cobrança.",
    {
      apiKey: v2ApiKey,
      id: z.string().describe("ID da assinatura (subs_...)."),
      productId: z.string().describe("ID do novo produto (com ciclo)."),
      quantity: z.number().int().min(1).describe("Quantidade do novo produto."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: "/subscriptions/change-plan",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ id: p.id, productId: p.productId, quantity: p.quantity }),
        });
        return { content: [{ type: "text", text: `Plano alterado (agendado):\n${JSON.stringify(res.data, null, 2)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2RecordSubscriptionUsage",
    "Registra uso (pay-as-you-go) numa assinatura ativa (API v2 — chave v2). Produto NÃO deve ter ciclo de cobrança.",
    {
      apiKey: v2ApiKey,
      id: z.string().describe("ID da assinatura (subs_...)."),
      productId: z.string().describe("ID do produto de uso (sem ciclo)."),
      units: z.number().int().min(1).describe("Unidades a registrar."),
      action: z.enum(["add", "subtract"]).describe("add: acrescenta; subtract: estorna."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: "/subscriptions/record-usage",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ id: p.id, productId: p.productId, units: p.units, action: p.action }),
        });
        return { content: [{ type: "text", text: `Uso registrado:\n${JSON.stringify(res.data, null, 2)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
