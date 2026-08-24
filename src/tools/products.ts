import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

const cycleEnum = z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUALLY", "ANNUALLY"]);

export function registerProductTools(server: McpServer) {
  server.tool(
    "createProduct",
    "Cria produto para usar em checkouts, links de pagamento ou assinaturas.",
    {
      apiKey: apiKeyParam(),
      externalId: z.string(),
      name: z.string(),
      price: z.number().int().min(1).describe("Preço em centavos."),
      currency: z.enum(["BRL"]).default("BRL"),
      description: z.string().optional(),
      image: z.string().url().optional().describe("URL de imagem remota; será baixada e re-hospedada (máx. 5MB)."),
      imageUrl: z.string().url().optional(),
      fileUrl: z
        .string()
        .url()
        .optional()
        .describe("URL de arquivo remoto (PDF, máx. 20MB); vira download após a compra."),
      cycle: cycleEnum
        .optional()
        .describe("Omitido = produto avulso (não recorrente); presente = elegível para assinaturas."),
      trialDays: z.number().int().min(1).max(90).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = {
          externalId: p.externalId,
          name: p.name,
          price: p.price,
          currency: p.currency ?? "BRL",
        };
        if (p.description != null) body.description = p.description;
        if (p.image) body.image = p.image;
        if (p.imageUrl) body.imageUrl = p.imageUrl;
        if (p.fileUrl) body.fileUrl = p.fileUrl;
        if (p.cycle) body.cycle = p.cycle;
        if (p.trialDays != null) body.trialDays = p.trialDays;

        const res = await makeAbacatePayRequest<any>({
          path: "/products/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [{ type: "text", text: `Produto ${d.id} — ${d.name} — ${d.price} centavos — ciclo: ${d.cycle ?? "avulso"}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "listProducts",
    "Lista produtos.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      externalId: z.string().optional(),
      keyword: z.string().optional(),
      name: z.string().optional(),
      status: z.string().optional(),
      currency: z.string().optional(),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/products/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            externalId: p.externalId,
            keyword: p.keyword,
            name: p.name,
            status: p.status,
            currency: p.currency,
            startDate: p.startDate,
            endDate: p.endDate,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((x: any, i: number) => `${i + 1}. ${x.id} — ${x.name} — ${x.status}`).join("\n") ||
          "Nenhum produto.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getProduct",
    "Busca produto por id, name ou externalId.",
    {
      apiKey: apiKeyParam(),
      id: z.string().optional(),
      name: z.string().optional(),
      externalId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/products/get${buildQuery({ id: p.id, name: p.name, externalId: p.externalId })}`,
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
    "deleteProduct",
    "Remove produto.",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/products/delete${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: "{}",
        });
        return { content: [{ type: "text", text: `Produto removido: ${res.data?.id ?? p.id}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
