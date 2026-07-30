import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

const webhookEvent = z.enum([
  "checkout.completed",
  "checkout.refunded",
  "checkout.disputed",
  "checkout.lost",
  "transparent.completed",
  "transparent.refunded",
  "transparent.disputed",
  "transparent.lost",
  "subscription.completed",
  "subscription.trial_started",
  "subscription.cancelled",
  "subscription.renewed",
  "subscription.plan_changed",
  "subscription.payment_failed",
  "payout.completed",
  "payout.failed",
  "transfer.completed",
  "transfer.failed",
]);

export function registerWebhookTools(server: McpServer) {
  server.tool(
    "createWebhook",
    "Cria um webhook para receber eventos da loja. endpoint deve ser HTTPS público. Requer que a loja tenha webhooks v2 habilitados.",
    {
      apiKey: apiKeyParam(),
      name: z.string().describe("Nome identificador do webhook."),
      endpoint: z.string().url().describe("URL HTTPS que recebe as notificações."),
      secret: z.string().describe("Segredo usado para autenticar o webhook (você define; não é gerado pela API)."),
      events: z.array(webhookEvent).min(1).describe("Eventos a assinar."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: "/webhooks/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({
            name: p.name,
            endpoint: p.endpoint,
            secret: p.secret,
            events: p.events,
          }),
        });
        const d = res.data;
        return {
          content: [{ type: "text", text: `Webhook criado: ${d?.id}\n${d?.name} → ${d?.endpoint}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "listWebhooks",
    "Lista webhooks da loja com paginação.",
    {
      apiKey: apiKeyParam(),
      search: z.string().optional(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/webhooks/list${buildQuery({
            limit: p.limit,
            search: p.search,
            after: p.after,
            before: p.before,
            id: p.id,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((w: any, i: number) => `${i + 1}. ${w.id} — ${w.name} — ${w.endpoint}`).join("\n") ||
          "Nenhum webhook.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getWebhook",
    "Busca um webhook por id.",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID do webhook (webh_...)."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/webhooks/get${buildQuery({ id: p.id })}`,
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
    "deleteWebhook",
    "Remove um webhook da loja (irreversível).",
    {
      apiKey: apiKeyParam(),
      id: z.string().describe("ID do webhook (webh_...)."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/webhooks/delete${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: "{}",
        });
        return { content: [{ type: "text", text: `Webhook removido: ${res.data?.id ?? p.id}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
