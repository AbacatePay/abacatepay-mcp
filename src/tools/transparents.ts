import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

const pixCustomer = z
  .object({
    name: z.string(),
    cellphone: z.string(),
    email: z.string().email(),
    taxId: z.string(),
  })
  .strict();

const boletoCustomer = z
  .object({
    name: z.string(),
    taxId: z.string(),
    email: z.string().email().optional(),
    cellphone: z.string().optional(),
    zipCode: z.string().optional(),
  })
  .strict();

const utm = z
  .object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
    term: z.string().optional(),
    content: z.string().optional(),
  })
  .strict();

const feeValue = z.object({ value: z.number().min(0) }).strict();

const transparentStatus = z.enum([
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

export function registerTransparentTools(server: McpServer) {
  server.tool(
    "createTransparentPix",
    "Cria QR Code PIX (checkout transparente, sem página hospedada).",
    {
      apiKey: apiKeyParam(),
      amount: z.number().int().min(100).describe("Valor em centavos, mínimo 100."),
      externalId: z.string().optional(),
      expiresIn: z.number().min(60).optional().describe("Segundos até expirar, mínimo 60."),
      description: z.string().max(140).optional(),
      customer: pixCustomer.optional(),
      utm: utm.optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const dataBody: Record<string, unknown> = { amount: p.amount };
        if (p.externalId) dataBody.externalId = p.externalId;
        if (p.expiresIn != null) dataBody.expiresIn = p.expiresIn;
        if (p.description) dataBody.description = p.description;
        if (p.customer) dataBody.customer = p.customer;
        if (p.utm) dataBody.utm = p.utm;
        if (p.metadata) dataBody.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
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
    "createTransparentBoleto",
    "Cria boleto (checkout transparente, sem página hospedada). Dados do cliente são obrigatórios.",
    {
      apiKey: apiKeyParam(),
      amount: z.number().int().min(100).describe("Valor em centavos, mínimo 100."),
      customer: boletoCustomer,
      dueDate: z.string().optional().describe("YYYY-MM-DD"),
      description: z.string().max(500).optional(),
      externalId: z.string().optional(),
      interest: feeValue.optional(),
      fine: z.object({ value: z.number().min(0), type: z.enum(["FIXED", "PERCENTAGE"]) }).strict().optional(),
      utm: utm.optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const dataBody: Record<string, unknown> = { amount: p.amount, customer: p.customer };
        if (p.dueDate) dataBody.dueDate = p.dueDate;
        if (p.description) dataBody.description = p.description;
        if (p.externalId) dataBody.externalId = p.externalId;
        if (p.interest) dataBody.interest = p.interest;
        if (p.fine) dataBody.fine = p.fine;
        if (p.utm) dataBody.utm = p.utm;
        if (p.metadata) dataBody.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          path: "/transparents/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ method: "BOLETO", data: dataBody }),
        });
        const d = res.data;
        return {
          content: [
            {
              type: "text",
              text: `Boleto ${d.id}\nstatus: ${d.status}\nurl: ${d.url}\ncódigo de barras: ${d.barCode}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getTransparent",
    "Busca um PIX transparente ou boleto por id.",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/transparents/get${buildQuery({ id: p.id })}`,
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
    "checkTransparentPix",
    "Status leve de um QR PIX transparente (apenas PIX; não funciona para boleto).",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
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
    "simulateTransparentPixPayment",
    "Simula o pagamento de um QR PIX transparente. Só funciona com chave de teste (dev mode).",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
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
    "listTransparent",
    "Lista QRs PIX e boletos transparentes (lista heterogênea).",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      externalId: z.string().optional(),
      method: z.enum(["PIX", "CARD", "PIX_QRCODE", "BOLETO"]).optional(),
      status: transparentStatus.optional(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/transparents/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            externalId: p.externalId,
            method: p.method,
            status: p.status,
            startDate: p.startDate,
            endDate: p.endDate,
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
    "refundTransparent",
    "Reembolsa integralmente um PIX ou boleto transparente pago (deve ser um recurso avulso, sem checkout hospedado associado).",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID público do recurso (char_/pix_char_/card_)."),
      reason: z.string().max(500).optional().describe("Motivo do reembolso."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { id: p.id };
        if (p.reason) body.reason = p.reason;
        const res = await makeAbacatePayRequest<any>({
          path: "/transparents/refund",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [{ type: "text", text: `Reembolsado\nrefund: ${d?.id}\nstatus: ${d?.status}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
