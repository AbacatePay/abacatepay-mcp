import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, checkoutStatus, paginationHint, toolError } from "./shared.js";

const subItem = z
  .object({
    id: z.string().describe("ID público do produto na loja (prod_...); deve ter cycle definido."),
    quantity: z.number().min(1).default(1),
  })
  .strict();

const retryPolicy = z
  .object({
    maxRetry: z.number().int().min(1).max(10).default(3),
    retryEvery: z.number().int().min(1).max(30).default(1),
  })
  .strict();

const subscriptionMethod = z.enum(["CARD", "PIX"]);

function reais(cents: number | null | undefined): string {
  return typeof cents === "number" ? `R$ ${(cents / 100).toFixed(2)}` : "—";
}

export function registerSubscriptionTools(server: McpServer) {
  server.tool(
    "createSubscription",
    "Cria um checkout de assinatura (bill_...) com produtos que têm cycle. A assinatura (subs_...) só nasce quando um cliente paga esse checkout, uma por cliente pagante. Para ver o checkout use getSubscriptionCheckout; para achar as assinaturas geradas, listSubscriptions com checkoutId.",
    {
      apiKey: apiKeyParam(),
      items: z.array(subItem).min(1),
      methods: z.array(subscriptionMethod).min(1).optional().describe("Padrão: CARD."),
      returnUrl: z.string().url().optional(),
      completionUrl: z.string().url().optional(),
      customerId: z.string().optional(),
      coupons: z
        .array(z.string())
        .max(50)
        .optional()
        .describe(
          "Códigos de cupom. Em assinatura o cliente só consegue aplicar cupom quando methods é só CARD e o produto não tem trial; com PIX o campo de cupom não aparece."
        ),
      externalId: z.string().optional(),
      upSellProductId: z.string().optional(),
      card: z.object({ maxInstallments: z.number().int().min(1).max(12) }).strict().optional(),
      retryPolicy: retryPolicy
        .optional()
        .describe("Política de novas tentativas em caso de falha de cobrança."),
      metadata: z.record(z.string(), z.unknown()).optional(),
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
        if (p.upSellProductId) body.upSellProductId = p.upSellProductId;
        if (p.card) body.card = p.card;
        if (p.retryPolicy) body.retryPolicy = p.retryPolicy;
        if (p.metadata) body.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          path: "/subscriptions/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [
            {
              type: "text",
              text:
                `Checkout de assinatura criado: ${d.id}\n${d.url}\nstatus: ${d.status}\n` +
                `A assinatura (subs_...) é criada quando o cliente pagar. Depois, use listSubscriptions com checkoutId="${d.id}".`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "listSubscriptions",
    "Lista assinaturas (subs_...): as que nasceram de um checkout de assinatura pago. Para listar os checkouts de assinatura (bill_...), use listSubscriptionCheckouts.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      status: z.enum(["ACTIVE", "CANCELLED"]).optional(),
      checkoutId: z.string().optional().describe("Só as assinaturas geradas por este checkout (bill_...)."),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/subscriptions/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            status: p.status,
            checkoutId: p.checkoutId,
            startDate: p.startDate,
            endDate: p.endDate,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data
            ?.map(
              (s: any, i: number) =>
                `${i + 1}. ${s.id} — ${s.status} — ${reais(s.amount)} — ${s.method} — cliente ${s.customerId} — ` +
                `checkout ${s.checkoutId ?? "—"} — próxima cobrança ${s.nextChargeAt ?? "—"}`
            )
            .join("\n") || "Nenhuma.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getSubscription",
    "Busca uma assinatura (subs_...) por id, pelo externalId do checkout que a originou ou por customerId.",
    {
      apiKey: apiKeyParam(),
      id: z.string().optional().describe("ID da assinatura (subs_...)."),
      externalId: z.string().optional().describe("externalId do checkout de assinatura que a originou."),
      customerId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/subscriptions/get${buildQuery({
            id: p.id,
            externalId: p.externalId,
            customerId: p.customerId,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getSubscriptionCheckout",
    "Busca um checkout de assinatura (bill_..., o que createSubscription devolve) por id, externalId, customerId ou method.",
    {
      apiKey: apiKeyParam(),
      id: z.string().optional().describe("ID do checkout de assinatura (bill_...)."),
      externalId: z.string().optional(),
      customerId: z.string().optional(),
      method: subscriptionMethod.optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/subscriptions/checkouts/get${buildQuery({
            id: p.id,
            externalId: p.externalId,
            customerId: p.customerId,
            method: p.method,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "listSubscriptionCheckouts",
    "Lista checkouts de assinatura (bill_...). Para as assinaturas geradas por eles (subs_...), use listSubscriptions.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      keyword: z.string().optional(),
      status: checkoutStatus.optional(),
      customerId: z.string().optional(),
      externalId: z.string().optional(),
      method: subscriptionMethod.optional(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/subscriptions/checkouts/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            keyword: p.keyword,
            status: p.status,
            customerId: p.customerId,
            externalId: p.externalId,
            method: p.method,
            startDate: p.startDate,
            endDate: p.endDate,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data
            ?.map((b: any, i: number) => `${i + 1}. ${b.id} — ${b.status} — ${reais(b.amount)} — ${b.url}`)
            .join("\n") || "Nenhum checkout de assinatura.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "deleteSubscriptionCheckout",
    "Exclui um checkout de assinatura (bill_...): o link deixa de aceitar novas assinaturas. As assinaturas já geradas por ele continuam ativas; para encerrar uma, use cancelSubscription.",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID do checkout de assinatura (bill_...)."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/subscriptions/checkouts/delete${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: "{}",
        });
        return { content: [{ type: "text", text: `Checkout de assinatura removido: ${res.data?.id ?? p.id}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "cancelSubscription",
    "Cancela imediatamente uma assinatura ativa. Irreversível; não há opção de pró-rata.",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID da assinatura (subs_...)."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
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
    "changeSubscriptionPlan",
    "Agenda alteração dos produtos de uma assinatura para o próximo ciclo. Informe productId+quantity OU items (múltiplos produtos exige feature SUBSCRIPTION_MULTI_PRODUCT).",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID da assinatura (subs_...)."),
      productId: z.string().optional().describe("ID do novo produto (com ciclo)."),
      quantity: z.number().int().min(1).optional(),
      items: z
        .array(z.object({ productId: z.string(), quantity: z.number().int().min(1) }).strict())
        .min(1)
        .optional()
        .describe("Alternativa a productId/quantity; tem prioridade se informado."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { id: p.id };
        if (p.items?.length) {
          body.items = p.items;
        } else {
          if (p.productId) body.productId = p.productId;
          if (p.quantity != null) body.quantity = p.quantity;
        }
        const res = await makeAbacatePayRequest<any>({
          path: "/subscriptions/change-plan",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        return { content: [{ type: "text", text: `Plano alterado (agendado):\n${JSON.stringify(res.data, null, 2)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "recordSubscriptionUsage",
    "Registra uso (cobrança pay-as-you-go) numa assinatura ativa. O produto NÃO deve ter ciclo de cobrança.",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID da assinatura (subs_...)."),
      productId: z.string().describe("ID do produto de uso (sem ciclo)."),
      units: z.number().int().min(1).describe("Unidades a registrar."),
      action: z.enum(["add", "subtract"]).describe("add: acrescenta; subtract: estorna."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
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
