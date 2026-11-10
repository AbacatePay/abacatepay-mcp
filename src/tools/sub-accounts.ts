import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, metadataStrings, paginationHint, toolError } from "./shared.js";

function reais(cents: number | null | undefined): string {
  return typeof cents === "number" ? `R$ ${(cents / 100).toFixed(2)}` : "—";
}

function describeSubAccount(s: any): string {
  return (
    `${s.id} — ${s.name} — ${s.taxId} — ext ${s.externalId ?? "—"} — ` +
    `disponível ${reais(s.balance?.available)} — bloqueado ${reais(s.balance?.blocked)}`
  );
}

export function registerSubAccountTools(server: McpServer) {
  server.tool(
    "createSubAccount",
    "Cria uma subconta (sacc_...): um saldo separado dentro da loja para um vendedor, identificado pelo CPF/CNPJ dele. Ela recebe partes dos PIX (splits em createTransparentPix) e saca para a chave CPF/CNPJ do titular. Criar de novo com o mesmo CPF/CNPJ devolve a subconta que já existe. O recurso precisa ser habilitado pelo suporte.",
    {
      apiKey: apiKeyParam(),
      name: z.string().min(1).max(100).describe("Nome do vendedor."),
      taxId: z
        .string()
        .min(11)
        .max(18)
        .describe("CPF ou CNPJ do vendedor, com ou sem máscara. Não pode ser o documento da própria loja."),
      externalId: z.string().min(1).max(100).optional().describe("Seu identificador da subconta (único na loja)."),
      metadata: metadataStrings.optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { name: p.name, taxId: p.taxId };
        if (p.externalId) body.externalId = p.externalId;
        if (p.metadata) body.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          path: "/sub-accounts/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        return { content: [{ type: "text", text: `Subconta: ${describeSubAccount(res.data)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getSubAccount",
    "Busca uma subconta pelo id, com o saldo atual.",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID da subconta (sacc_...)."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/sub-accounts/get${buildQuery({ id: p.id })}`,
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
    "listSubAccounts",
    "Lista as subcontas da loja, com o saldo de cada uma.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      taxId: z.string().optional().describe("CPF ou CNPJ do vendedor."),
      externalId: z.string().optional(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/sub-accounts/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            taxId: p.taxId,
            externalId: p.externalId,
            startDate: p.startDate,
            endDate: p.endDate,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((s: any, i: number) => `${i + 1}. ${describeSubAccount(s)}`).join("\n") || "Nenhuma subconta.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "withdrawSubAccount",
    "Saca o saldo de uma subconta por PIX. O dinheiro vai sempre para a chave CPF/CNPJ do titular da subconta; não dá para escolher outra chave. Este endpoint não deduplica por externalId: depois de um timeout, consulte getPayout com o mesmo externalId antes de tentar de novo.",
    {
      apiKey: apiKeyParam(),
      id: z.string().regex(/^sacc_/).describe("ID da subconta (sacc_...)."),
      amount: z.number().int().min(100).describe("Valor em centavos, mínimo 100."),
      externalId: z.string().min(1).max(100).describe("Seu identificador do saque."),
      description: z.string().max(140).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = { id: p.id, amount: p.amount, externalId: p.externalId };
        if (p.description) body.description = p.description;

        const res = await makeAbacatePayRequest<any>({
          path: "/sub-accounts/withdraw",
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
              text: `Saque da subconta ${d.subAccountId}: ${d.id} — ${d.status} — ${reais(d.amount)} — ext ${d.externalId}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
