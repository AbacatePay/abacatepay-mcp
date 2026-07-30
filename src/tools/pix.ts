import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam } from "./shared.js";

export function registerPixTools(server: McpServer) {
  server.tool(
    "createPixQrCode",
    "Cria um QR Code PIX para pagamento direto (API v1 — requer chave v1).",
    {
      apiKey: apiKeyParam("v1"),
      amount: z.number().describe("Valor da cobrança em centavos"),
      expiresIn: z.number().optional().describe("Tempo de expiração em segundos (opcional)"),
      description: z
        .string()
        .max(37)
        .optional()
        .describe("Mensagem no pagamento PIX (máx. 37 caracteres na API v1)"),
      customer: z
        .object({
          name: z.string(),
          cellphone: z.string(),
          email: z.string().email(),
          taxId: z.string(),
        })
        .strict()
        .optional()
        .describe("Dados do cliente (opcional; se informar, todos os campos são obrigatórios)"),
    },
    async (params, extra) => {
      const { apiKey, amount, expiresIn, description, customer } = params as any;
      try {
        const requestBody: Record<string, unknown> = {
          amount,
        };

        if (expiresIn !== undefined) {
          requestBody.expiresIn = expiresIn;
        }

        if (description) {
          requestBody.description = description;
        }

        if (customer) {
          requestBody.customer = customer;
        }

        const response = await makeAbacatePayRequest<any>({
          version: "v1",
          path: "/pixQrCode/create",
          apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(requestBody),
        });

        const data = response.data;
        const amountFormatted = (data.amount / 100).toFixed(2);
        const feeFormatted = (data.platformFee / 100).toFixed(2);

        return {
          content: [
            {
              type: "text",
              text:
                `🎯 **QR Code PIX criado com sucesso!**\n\n` +
                `📋 **Detalhes:**\n` +
                `• ID: ${data.id}\n` +
                `• Valor: R$ ${amountFormatted}\n` +
                `• Status: ${data.status}\n` +
                `• Taxa da Plataforma: R$ ${feeFormatted}\n` +
                `• Criado em: ${new Date(data.createdAt).toLocaleString("pt-BR")}\n` +
                `• Expira em: ${new Date(data.expiresAt).toLocaleString("pt-BR")}\n\n` +
                `📱 **Código PIX (Copia e Cola):**\n\`\`\`\n${data.brCode}\n\`\`\`\n\n` +
                `🖼️ **QR Code Base64:**\n${data.brCodeBase64.substring(0, 100)}...\n\n` +
                `${data.devMode ? "⚠️ Modo de desenvolvimento ativo" : "✅ Modo de produção"}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao criar QR Code PIX: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "simulatePixPayment",
    "Simula o pagamento de um QR Code PIX (apenas em modo desenvolvimento; API v1).",
    {
      apiKey: apiKeyParam("v1"),
      id: z.string().describe("ID do QR Code PIX para simular o pagamento"),
      metadata: z.record(z.unknown()).optional().describe("Metadados opcionais para a requisição"),
    },
    async (params, extra) => {
      const { apiKey, id, metadata } = params as any;
      try {
        const requestBody: Record<string, unknown> = {};

        if (metadata) {
          requestBody.metadata = metadata;
        }

        const response = await makeAbacatePayRequest<any>({
          version: "v1",
          path: `/pixQrCode/simulate-payment?id=${encodeURIComponent(id)}`,
          apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(requestBody),
        });

        const data = response.data;
        const amountFormatted = (data.amount / 100).toFixed(2);
        const feeFormatted = (data.platformFee / 100).toFixed(2);

        const statusEmojis: Record<string, string> = {
          PENDING: "⏳",
          PAID: "✅",
          EXPIRED: "⏰",
          CANCELLED: "❌",
          REFUNDED: "↩️",
        };
        const statusEmoji = statusEmojis[data.status] || "❓";

        return {
          content: [
            {
              type: "text",
              text:
                `${statusEmoji} **Pagamento PIX simulado com sucesso!**\n\n` +
                `📋 **Detalhes do Pagamento:**\n` +
                `• ID: ${data.id}\n` +
                `• Status: ${data.status}\n` +
                `• Valor: R$ ${amountFormatted}\n` +
                `• Taxa da Plataforma: R$ ${feeFormatted}\n` +
                `• Criado em: ${new Date(data.createdAt).toLocaleString("pt-BR")}\n` +
                `• Atualizado em: ${new Date(data.updatedAt).toLocaleString("pt-BR")}\n` +
                `• Expira em: ${new Date(data.expiresAt).toLocaleString("pt-BR")}\n\n` +
                `${data.devMode ? "⚠️ Simulação realizada em modo de desenvolvimento" : "✅ Pagamento em produção"}\n\n` +
                `🎉 O pagamento foi processado com sucesso!`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao simular pagamento PIX: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "checkPixStatus",
    "Verifica o status de um QR Code PIX (API v1 — requer chave v1).",
    {
      apiKey: apiKeyParam("v1"),
      id: z.string().describe("ID do QR Code PIX para verificar o status"),
    },
    async (params, extra) => {
      const { apiKey, id } = params as any;
      try {
        const response = await makeAbacatePayRequest<any>({
          version: "v1",
          path: `/pixQrCode/check?id=${encodeURIComponent(id)}`,
          apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });

        const data = response.data;

        const statusEmojis: Record<string, string> = {
          PENDING: "⏳",
          PAID: "✅",
          EXPIRED: "⏰",
          CANCELLED: "❌",
          REFUNDED: "↩️",
        };
        const statusEmoji = statusEmojis[data.status] || "❓";

        return {
          content: [
            {
              type: "text",
              text:
                `${statusEmoji} **Status do QR Code PIX**\n\n` +
                `📋 **ID**: ${id}\n` +
                `📊 **Status**: ${data.status}\n` +
                `⏰ **Expira em**: ${new Date(data.expiresAt).toLocaleString("pt-BR")}\n\n` +
                `${
                  data.status === "PENDING"
                    ? "⏳ Aguardando pagamento..."
                    : data.status === "PAID"
                      ? "✅ Pagamento confirmado!"
                      : data.status === "EXPIRED"
                        ? "⏰ QR Code expirado"
                        : data.status === "CANCELLED"
                          ? "❌ QR Code cancelado"
                          : data.status === "REFUNDED"
                            ? "↩️ Pagamento estornado"
                            : "❓ Status desconhecido"
                }`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao verificar status do PIX: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            },
          ],
        };
      }
    }
  );
}
