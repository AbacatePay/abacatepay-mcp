import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

export function registerCustomerTools(server: McpServer) {
  server.tool(
    "createCustomer",
    "Cria um cliente. Apenas email é obrigatório.",
    {
      apiKey: apiKeyParam(),
      email: z.string().email(),
      name: z.string().optional(),
      cellphone: z.string().optional(),
      taxId: z.string().optional(),
      zipCode: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    async (params, extra) => {
      const { apiKey, email, name, cellphone, taxId, zipCode, metadata } = params as any;
      try {
        const body: Record<string, unknown> = { email };
        if (name) body.name = name;
        if (cellphone) body.cellphone = cellphone;
        if (taxId) body.taxId = taxId;
        if (zipCode) body.zipCode = zipCode;
        if (metadata) body.metadata = metadata;

        const res = await makeAbacatePayRequest<any>({
          path: "/customers/create",
          apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [
            {
              type: "text",
              text: `Cliente criado: ${d.id}\nemail: ${d.email}\nnome: ${d.name ?? "—"}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "listCustomers",
    "Lista clientes com paginação.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      email: z.string().optional(),
      taxId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/customers/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            email: p.email,
            taxId: p.taxId,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((c: any, i: number) => `${i + 1}. ${c.id} — ${c.email} — ${c.name ?? ""}`).join("\n") ||
          "Nenhum cliente.";
        return {
          content: [
            {
              type: "text",
              text: `${rows}${paginationHint(res.pagination)}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getCustomer",
    "Busca um cliente por id, email ou taxId.",
    {
      apiKey: apiKeyParam(),
      id: z.string().optional(),
      email: z.string().optional(),
      taxId: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/customers/get${buildQuery({ id: p.id, email: p.email, taxId: p.taxId })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const d = res.data;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(d, null, 2),
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "deleteCustomer",
    "Remove um cliente por id (irreversível).",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/customers/delete${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: "{}",
        });
        return {
          content: [
            {
              type: "text",
              text: `Cliente removido: ${res.data?.id ?? p.id}`,
            },
          ],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
