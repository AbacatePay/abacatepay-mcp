import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, toolError } from "./shared.js";

export function registerCustomerPortalTools(server: McpServer) {
  server.tool(
    "createCustomerPortal",
    "Gera o link do portal do cliente para uma compra (cliente + checkout). No portal o cliente entra com um código enviado por e-mail, vê os pagamentos, pede reembolso (quem decide é a loja), cancela a assinatura e troca o cartão.",
    {
      apiKey: apiKeyParam(),
      customerId: z.string().min(1).max(64).describe("ID do cliente (cust_...)."),
      checkoutId: z.string().min(1).max(64).describe("ID do checkout (bill_...) que o cliente comprou."),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: "/customer-portal/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ customerId: p.customerId, checkoutId: p.checkoutId }),
        });
        const d = res.data;
        return { content: [{ type: "text", text: `Portal do cliente: ${d.url}\nlink: ${d.id}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
