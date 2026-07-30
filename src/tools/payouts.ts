import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

const pixDest = z
  .object({
    type: z.enum(["CPF", "CNPJ", "PHONE", "EMAIL", "RANDOM", "BR_CODE"]),
    key: z.string(),
  })
  .strict();

export function registerPayoutTools(server: McpServer) {
  server.tool(
    "createPayout",
    "Transfere saldo da conta Abacate Pay para uma chave PIX da própria loja (a chave de destino deve pertencer ao mesmo CPF/CNPJ da loja).",
    {
      apiKey: apiKeyParam(),
      amount: z.number().min(1).describe("Valor em centavos."),
      pix: pixDest.describe("Chave PIX de destino (deve ser da própria loja)."),
      externalId: z.string().optional(),
      description: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = {
          amount: p.amount,
          pix: p.pix,
        };
        if (p.externalId) body.externalId = p.externalId;
        if (p.description) body.description = p.description;

        const res = await makeAbacatePayRequest<any>({
          path: "/payouts/create",
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
              text: `Payout ${d.id} — ${d.status} — ${d.amount} centavos — ext ${d.externalId ?? "—"}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getPayout",
    "Busca payout por id ou externalId.",
    {
      apiKey: apiKeyParam(),
      id: z.string().optional(),
      externalId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/payouts/get${buildQuery({ id: p.id, externalId: p.externalId })}`,
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
    "listPayouts",
    "Lista payouts.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/payouts/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((t: any, i: number) => `${i + 1}. ${t.id} — ${t.status} — ${t.externalId ?? "—"}`).join("\n") ||
          "Nenhum payout.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
