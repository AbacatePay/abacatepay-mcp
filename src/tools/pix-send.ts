import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { buildQuery, apiKeyParam, toolError } from "./shared.js";

const pixDest = z
  .object({
    type: z.enum(["CPF", "CNPJ", "PHONE", "EMAIL", "RANDOM", "BR_CODE"]),
    key: z.string(),
  })
  .strict();

export function registerPixSendTools(server: McpServer) {
  server.tool(
    "sendPix",
    "Envia PIX para a chave de um terceiro (fornecedor, parceiro). A chave não pode ser da própria loja: para sacar para a sua conta, use createPayout. Repetir o mesmo externalId devolve o envio já feito em vez de mandar outro, então depois de um timeout é seguro chamar de novo com o mesmo externalId e o mesmo valor (valor diferente dá erro).",
    {
      apiKey: apiKeyParam(),
      externalId: z
        .string()
        .describe("Obrigatório: identificador único no seu sistema; é ele que evita envio em dobro."),
      amount: z.number().int().min(100).describe("Valor em centavos, mínimo 100."),
      pix: pixDest,
      description: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = {
          externalId: p.externalId,
          amount: p.amount,
          pix: p.pix,
        };
        if (p.description) body.description = p.description;

        const res = await makeAbacatePayRequest<any>({
          path: "/pix/send",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getPixTransaction",
    "Busca um envio PIX pelo id (obrigatório); externalId é apenas informativo adicional.",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
      externalId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/pix/get${buildQuery({ id: p.id, externalId: p.externalId })}`,
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
    "listPixTransactions",
    "Consulta envios PIX pelo id (obrigatório). Este endpoint não pagina nem filtra por status.",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
      externalId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/pix/list${buildQuery({ id: p.id, externalId: p.externalId })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((t: any, i: number) => `${i + 1}. ${t.id} — ${t.status}`).join("\n") || "Nenhuma.";
        return { content: [{ type: "text", text: rows }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
