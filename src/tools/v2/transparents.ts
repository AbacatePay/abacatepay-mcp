import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../../http/api.js";
import { buildQuery, paginationHint, toolError, v2ApiKey } from "./helpers.js";

const customerBlock = z
  .object({
    name: z.string(),
    cellphone: z.string(),
    email: z.string().email(),
    taxId: z.string(),
  })
  .strict();

export function registerV2TransparentTools(server: McpServer) {
  server.tool(
    "v2CreateTransparentPix",
    "Cria QR Code PIX (checkout transparente; API v2).",
    {
      apiKey: v2ApiKey,
      amount: z.number().describe("Valor em centavos"),
      expiresIn: z.number().optional(),
      description: z.string().max(140).optional(),
      customer: customerBlock.optional(),
      metadata: z.record(z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const dataBody: Record<string, unknown> = { amount: p.amount };
        if (p.expiresIn != null) dataBody.expiresIn = p.expiresIn;
        if (p.description) dataBody.description = p.description;
        if (p.customer) dataBody.customer = p.customer;
        if (p.metadata) dataBody.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: "/transparents/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ method: "PIX", data: dataBody }),
        });
        const d = res.data;
        return {
          content: [
            {
              type: "text",
              text:
                `PIX transparente ${d.id}\nstatus: ${d.status}\nbrCode:\n${d.brCode}\n` +
                `(QR base64 truncado) ${String(d.brCodeBase64).slice(0, 80)}...`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2CheckTransparentPix",
    "Status do QR transparente (API v2).",
    {
      apiKey: v2ApiKey,
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: `/transparents/check${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const d = res.data;
        return {
          content: [
            {
              type: "text",
              text: `id: ${d.id}\nstatus: ${d.status}\nexpira: ${d.expiresAt}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2SimulateTransparentPixPayment",
    "Simula pagamento em dev (API v2).",
    {
      apiKey: v2ApiKey,
      id: z.string(),
      metadata: z.record(z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: `/transparents/simulate-payment${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ metadata: p.metadata ?? {} }),
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2ListTransparentPix",
    "Lista QRs transparentes (API v2).",
    {
      apiKey: v2ApiKey,
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      status: z
        .enum(["PENDING", "EXPIRED", "CANCELLED", "PAID", "REFUNDED"])
        .optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          version: "v2",
          path: `/transparents/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            status: p.status,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((x: any, i: number) => `${i + 1}. ${x.id} — ${x.status} — ${x.amount}c`).join("\n") ||
          "Nenhum.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "v2RefundTransparentPix",
    "Reembolsa integralmente um PIX transparente pago (API v2 — chave v2).",
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
          path: "/transparents/refund",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        return {
          content: [{ type: "text", text: `PIX reembolsado\nrefund: ${res.data?.refundPublicId}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
