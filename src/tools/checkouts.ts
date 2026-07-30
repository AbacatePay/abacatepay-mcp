import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

const checkoutItem = z
  .object({
    id: z.string().describe("ID público do produto na loja (prod_...)"),
    quantity: z.number().min(1).default(1),
  })
  .strict();

const feeValue = z.object({ value: z.number().min(0) }).strict();

const checkoutStatus = z.enum([
  "PENDING",
  "EXPIRED",
  "CANCELLED",
  "PAID",
  "UNDER_DISPUTE",
  "REFUNDED",
  "REDEEMED",
  "APPROVED",
  "FAILED",
]);

export function registerCheckoutTools(server: McpServer) {
  server.tool(
    "createCheckout",
    "Cria checkout de pagamento único (ONE_TIME) com itens de produto já cadastrados.",
    {
      apiKey: apiKeyParam(),
      items: z.array(checkoutItem).min(1),
      methods: z.array(z.enum(["PIX", "CARD", "BOLETO"])).min(1).optional().describe("Padrão: PIX e CARD."),
      card: z.object({ maxInstallments: z.number().int().min(1).max(12) }).strict().optional(),
      returnUrl: z.string().url().optional(),
      completionUrl: z.string().url().optional(),
      customerId: z.string().optional(),
      coupons: z.array(z.string()).max(50).optional(),
      externalId: z.string().optional(),
      upSellProductId: z.string().optional(),
      interest: feeValue.optional(),
      fine: z.object({ value: z.number().min(0), type: z.enum(["FIXED", "PERCENTAGE"]) }).strict().optional(),
      dueDate: z.string().optional().describe("YYYY-MM-DD"),
      metadata: z.record(z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { items: p.items };
        if (p.methods) body.methods = p.methods;
        if (p.card) body.card = p.card;
        if (p.returnUrl) body.returnUrl = p.returnUrl;
        if (p.completionUrl) body.completionUrl = p.completionUrl;
        if (p.customerId) body.customerId = p.customerId;
        if (p.coupons?.length) body.coupons = p.coupons;
        if (p.externalId) body.externalId = p.externalId;
        if (p.upSellProductId) body.upSellProductId = p.upSellProductId;
        if (p.interest) body.interest = p.interest;
        if (p.fine) body.fine = p.fine;
        if (p.dueDate) body.dueDate = p.dueDate;
        if (p.metadata) body.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          path: "/checkouts/create",
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
              text: `Checkout criado\nID: ${d.id}\nURL: ${d.url}\nStatus: ${d.status}\nValor (centavos): ${d.amount}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "listCheckouts",
    "Lista checkouts (pagamento único).",
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
      method: z.enum(["PIX", "CRYPTO", "CARD", "BOLETO"]).optional(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/checkouts/list${buildQuery({
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
          res.data?.map((b: any, i: number) => `${i + 1}. ${b.id} — ${b.status} — R$ ${(b.amount / 100).toFixed(2)}`).join(
            "\n"
          ) || "Nenhum checkout.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getCheckout",
    "Obtém um checkout por id, externalId, customerId ou method.",
    {
      apiKey: apiKeyParam(),
      id: z.string().optional(),
      externalId: z.string().optional(),
      customerId: z.string().optional(),
      method: z.enum(["PIX", "CRYPTO", "CARD", "BOLETO"]).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/checkouts/get${buildQuery({
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
    "deleteCheckout",
    "Remove um checkout (irreversível).",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/checkouts/delete${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: "{}",
        });
        return { content: [{ type: "text", text: `Checkout removido: ${res.data?.id ?? p.id}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "refundCheckout",
    "Reembolsa integralmente um checkout pago. Reembolso parcial não é suportado.",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID público do recurso (char_/pix_char_/card_/bill_)."),
      reason: z.string().max(500).optional().describe("Motivo do reembolso."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { id: p.id };
        if (p.reason) body.reason = p.reason;
        const res = await makeAbacatePayRequest<any>({
          path: "/checkouts/refund",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [{ type: "text", text: `Checkout reembolsado\nrefund: ${d?.id}\nstatus: ${d?.status}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
