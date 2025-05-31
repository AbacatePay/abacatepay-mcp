import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";

export function registerPixTools(server: McpServer) {
  server.tool(
    "createPixQrCode",
    "Cria um QR Code PIX para pagamento direto",
    {
      amount: z.number().describe("Valor da cobrança em centavos"),
      expiresIn: z.number().optional().describe("Tempo de expiração em segundos (opcional)"),
      description: z.string().max(140).optional().describe("Mensagem que aparecerá no pagamento PIX (máx 140 caracteres)"),
      customer: z.object({
        name: z.string().describe("Nome completo do cliente"),
        cellphone: z.string().describe("Celular do cliente"),
        email: z.string().email().describe("E-mail do cliente"),
        taxId: z.string().describe("CPF ou CNPJ do cliente")
      }).optional().describe("Dados do cliente (opcional)")
    },
    async ({ amount, expiresIn, description, customer }) => {
      try {
        const requestBody: any = {
          amount
        };

        if (expiresIn) {
          requestBody.expiresIn = expiresIn;
        }

        if (description) {
          requestBody.description = description;
        }

        if (customer) {
          requestBody.customer = customer;
        }

        const response = await makeAbacatePayRequest<any>("/pixQrCode/create", {
          method: "POST",
          body: JSON.stringify(requestBody)
        });

        const data = response.data;
        const amountFormatted = (data.amount / 100).toFixed(2);
        const feeFormatted = (data.platformFee / 100).toFixed(2);
        
        return {
          content: [
            {
              type: "text",
              text: `🎯 **QR Code PIX criado com sucesso!**\n\n` +
                    `📋 **Detalhes:**\n` +
                    `• ID: ${data.id}\n` +
                    `• Valor: R$ ${amountFormatted}\n` +
                    `• Status: ${data.status}\n` +
                    `• Taxa da Plataforma: R$ ${feeFormatted}\n` +
                    `• Criado em: ${new Date(data.createdAt).toLocaleString('pt-BR')}\n` +
                    `• Expira em: ${new Date(data.expiresAt).toLocaleString('pt-BR')}\n\n` +
                    `📱 **Código PIX (Copia e Cola):**\n\`\`\`\n${data.brCode}\n\`\`\`\n\n` +
                    `🖼️ **QR Code Base64:**\n${data.brCodeBase64.substring(0, 100)}...\n\n` +
                    `${data.devMode ? '⚠️ Modo de desenvolvimento ativo' : '✅ Modo de produção'}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao criar QR Code PIX: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    "simulatePixPayment",
    "Simula o pagamento de um QR Code PIX (apenas em modo desenvolvimento)",
    {
      id: z.string().describe("ID do QR Code PIX para simular o pagamento"),
      metadata: z.object({}).optional().describe("Metadados opcionais para a requisição")
    },
    async ({ id, metadata }) => {
      try {
        const requestBody: any = {};

        if (metadata) {
          requestBody.metadata = metadata;
        }

        const response = await makeAbacatePayRequest<any>(`/pixQrCode/simulate-payment?id=${id}`, {
          method: "POST",
          body: JSON.stringify(requestBody)
        });

        const data = response.data;
        const amountFormatted = (data.amount / 100).toFixed(2);
        const feeFormatted = (data.platformFee / 100).toFixed(2);
        
        const statusEmojis: Record<string, string> = {
          'PENDING': '⏳',
          'PAID': '✅',
          'EXPIRED': '⏰',
          'CANCELLED': '❌',
          'REFUNDED': '↩️'
        };
        const statusEmoji = statusEmojis[data.status] || '❓';
        
        return {
          content: [
            {
              type: "text",
              text: `${statusEmoji} **Pagamento PIX simulado com sucesso!**\n\n` +
                    `📋 **Detalhes do Pagamento:**\n` +
                    `• ID: ${data.id}\n` +
                    `• Status: ${data.status}\n` +
                    `• Valor: R$ ${amountFormatted}\n` +
                    `• Taxa da Plataforma: R$ ${feeFormatted}\n` +
                    `• Criado em: ${new Date(data.createdAt).toLocaleString('pt-BR')}\n` +
                    `• Atualizado em: ${new Date(data.updatedAt).toLocaleString('pt-BR')}\n` +
                    `• Expira em: ${new Date(data.expiresAt).toLocaleString('pt-BR')}\n\n` +
                    `${data.devMode ? '⚠️ Simulação realizada em modo de desenvolvimento' : '✅ Pagamento em produção'}\n\n` +
                    `🎉 O pagamento foi processado com sucesso!`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao simular pagamento PIX: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    "checkPixStatus",
    "Verifica o status de um QR Code PIX",
    {
      id: z.string().describe("ID do QR Code PIX para verificar o status")
    },
    async ({ id }) => {
      try {
        const response = await makeAbacatePayRequest<any>(`/pixQrCode/check?id=${id}`, {
          method: "GET"
        });

        const data = response.data;
        
        const statusEmojis: Record<string, string> = {
          'PENDING': '⏳',
          'PAID': '✅',
          'EXPIRED': '⏰',
          'CANCELLED': '❌',
          'REFUNDED': '↩️'
        };
        const statusEmoji = statusEmojis[data.status] || '❓';
        
        return {
          content: [
            {
              type: "text",
              text: `${statusEmoji} **Status do QR Code PIX**\n\n` +
                    `📋 **ID**: ${id}\n` +
                    `📊 **Status**: ${data.status}\n` +
                    `⏰ **Expira em**: ${new Date(data.expiresAt).toLocaleString('pt-BR')}\n\n` +
                    `${data.status === 'PENDING' ? '⏳ Aguardando pagamento...' : 
                      data.status === 'PAID' ? '✅ Pagamento confirmado!' :
                      data.status === 'EXPIRED' ? '⏰ QR Code expirado' :
                      data.status === 'CANCELLED' ? '❌ QR Code cancelado' :
                      data.status === 'REFUNDED' ? '↩️ Pagamento estornado' : 
                      '❓ Status desconhecido'}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao verificar status do PIX: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            }
          ]
        };
      }
    }
  );
} 