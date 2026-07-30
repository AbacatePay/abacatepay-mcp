import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../../http/api.js";
import { buildQuery, paginationHint, toolError, v2ApiKey } from "./helpers.js";

const linkItem = z
  .object({
    id: z.string(),
    quantity: z.number().min(1),
  })
  .strict();

export function registerV2PaymentLinkTools(server: McpServer) {
  server.tool(
    "v2CreatePaymentLink",
    "Cria link de pagamento (MULTIPLE_PAYMENTS; API v2).",
    {
      apiKey: v2ApiKey,
      items: z.array(linkItem).min(1),
      methods: z.array(z.enum(["PIX", "CARD"])).min(1).optional(),
      returnUrl: z.string().url().optional(),
      completionUrl: z.string().url().optional(),
      coupons: z.array(z.string()).max(50).optional(),
      externalId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = {
          frequency: "MULTIPLE_PAYMENTS",
          items: p.items,
        };
        if (p.methods) body.methods = p.methods;
        if (p.returnUrl) body.returnUrl = p.returnUrl;
        if (p.completionUrl) body.completionUrl = p.completionUrl;
        if (p.coupons?.length) body.coupons = p.coupons;
        if (p.externalId) body.externalId = p.externalId;
        if (p.metadata) body.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: "/payment-links/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [
            { type: "text", text: `Link: ${d.id}\n${d.url}\nstatus: ${d.status}` },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2ListPaymentLinks",
    "Lista links de pagamento (API v2).",
    {
      apiKey: v2ApiKey,
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      externalId: z.string().optional(),
      status: z.enum(["PENDING", "EXPIRED", "CANCELLED", "PAID", "REFUNDED"]).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: `/payment-links/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            externalId: p.externalId,
            status: p.status,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((b: any, i: number) => `${i + 1}. ${b.id} — ${b.status}`).join("\n") ||
          "Nenhum link.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2GetPaymentLink",
    "Busca link de pagamento por id (API v2).",
    {
      apiKey: v2ApiKey,
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: `/payment-links/get${buildQuery({ id: p.id })}`,
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
    "v2RefundPaymentLink",
    "Reembolsa integralmente um pagamento de link (API v2 — chave v2).",
    {
      apiKey: v2ApiKey,
      id: z.string().describe("ID público do recurso (char_/pix_char_/card_/bill_)."),
      reason: z.string().max(500).optional().describe("Motivo do reembolso."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { id: p.id };
        if (p.reason) body.reason = p.reason;
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: "/payment-links/refund",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        return {
          content: [{ type: "text", text: `Link reembolsado\nrefund: ${res.data?.refundPublicId}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
