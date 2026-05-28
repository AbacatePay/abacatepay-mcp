import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam } from "./shared.js";

const customerPayload = z
  .object({
    name: z.string(),
    cellphone: z.string(),
    email: z.string().email(),
    taxId: z.string(),
  })
  .strict();

const productItem = z
  .object({
    externalId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    quantity: z.number(),
    price: z.number(),
  })
  .strict();

export function registerBillingTools(server: McpServer) {
  server.tool(
    "createBilling",
    "Cria uma nova cobrança no Abacate Pay (API v1 — requer chave v1).",
    {
      apiKey: apiKeyParam("v1"),
      frequency: z
        .enum(["ONE_TIME", "MULTIPLE_PAYMENTS"])
        .default("ONE_TIME")
        .describe("Tipo de frequência da cobrança"),
      methods: z
        .array(z.enum(["PIX", "CARD"]))
        .min(1)
        .describe("Métodos de pagamento (PIX e/ou CARD)"),
      products: z.array(productItem).describe("Lista de produtos"),
      returnUrl: z.string().url().describe("URL para redirecionar caso o cliente clique em 'Voltar'"),
      completionUrl: z
        .string()
        .url()
        .describe("URL para redirecionar quando o pagamento for concluído"),
      customerId: z.string().optional().describe("ID de um cliente já cadastrado (opcional)"),
      customer: customerPayload.optional().describe("Dados do cliente (cria se não existir; opcional)"),
      allowCoupons: z.boolean().optional().describe("Permitir cupons nesta cobrança"),
      coupons: z.array(z.string()).max(50).optional().describe("Cupons disponíveis para esta cobrança"),
      externalId: z.string().optional().describe("ID externo opcional da cobrança no seu sistema"),
      metadata: z.record(z.unknown()).optional().describe("Metadados opcionais da cobrança"),
    },
    async (params, extra) => {
      const {
        apiKey,
        frequency,
        methods,
        products,
        returnUrl,
        completionUrl,
        customerId,
        customer,
        allowCoupons,
        coupons,
        externalId,
        metadata,
      } = params as any;
      try {
        const requestBody: Record<string, unknown> = {
          frequency,
          methods,
          products,
          returnUrl,
          completionUrl,
        };

        if (customerId) requestBody.customerId = customerId;
        if (customer) requestBody.customer = customer;
        if (allowCoupons !== undefined) requestBody.allowCoupons = allowCoupons;
        if (coupons?.length) requestBody.coupons = coupons;
        if (externalId) requestBody.externalId = externalId;
        if (metadata) requestBody.metadata = metadata;

        const response = await makeAbacatePayRequest<any>({
          version: "v1",
          path: "/billing/create",
          apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(requestBody),
        });

        const data = response.data;
        const totalAmount = data.amount != null ? (data.amount / 100).toFixed(2) : "—";

        return {
          content: [
            {
              type: "text",
              text:
                `Cobrança criada com sucesso! 🎉\n\n` +
                `📋 **Detalhes da Cobrança:**\n` +
                `• ID: ${data.id}\n` +
                `• Status: ${data.status}\n` +
                `• Valor Total: R$ ${totalAmount}\n` +
                `• Frequência: ${data.frequency}\n` +
                `• Métodos: ${data.methods.join(", ")}\n` +
                `• Produtos: ${data.products.length} item(s)\n\n` +
                `🔗 **Link de Pagamento:**\n${data.url}\n\n` +
                `${data.devMode ? "⚠️ Modo de desenvolvimento ativo" : "✅ Modo de produção"}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao criar cobrança: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "listBillings",
    "Lista todas as cobranças criadas no Abacate Pay (API v1 — requer chave v1).",
    {
      apiKey: apiKeyParam("v1"),
    },
    async (params, extra) => {
      const { apiKey } = params as any;
      try {
        const response = await makeAbacatePayRequest<any>({
          version: "v1",
          path: "/billing/list",
          apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });

        if (!response.data || response.data.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Nenhuma cobrança encontrada.",
              },
            ],
          };
        }

        const billingsList = response.data.map((billing: any, index: number) => {
          const amount =
            billing.amount != null ? (billing.amount / 100).toFixed(2) : "—";
          const customer = billing.customer?.metadata;

          const statusEmojis: Record<string, string> = {
            PENDING: "⏳",
            PAID: "✅",
            EXPIRED: "⏰",
            CANCELLED: "❌",
            REFUNDED: "↩️",
          };
          const statusEmoji = statusEmojis[billing.status] || "❓";

          return `${index + 1}. ${statusEmoji} **${billing.status}** - R$ ${amount}
     📋 ID: ${billing.id}
     🔗 URL: ${billing.url}
     📦 Produtos: ${billing.products.length} item(s)
     👤 Cliente: ${customer?.name || "N/A"}
     📅 Frequência: ${billing.frequency}
     💳 Métodos: ${billing.methods.join(", ")}
     ${billing.devMode ? "⚠️ Modo Dev" : "✅ Produção"}`;
        }).join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `📋 **Lista de Cobranças** (${response.data.length} encontrada(s)):\n\n${billingsList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao listar cobranças: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            },
          ],
        };
      }
    }
  );
}
