import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam } from "./shared.js";

export function registerCouponTools(server: McpServer) {
  server.tool(
    "createCoupon",
    "Cria um novo cupom de desconto (API v1 — requer chave v1).",
    {
      apiKey: apiKeyParam("v1"),
      code: z.string().describe("Código único do cupom (ex: DESCONTO20)"),
      discountKind: z
        .enum(["PERCENTAGE", "FIXED"])
        .describe("Tipo de desconto: PERCENTAGE (porcentagem) ou FIXED (valor fixo)"),
      discount: z.number().describe("Valor do desconto (em % para PERCENTAGE ou em centavos para FIXED)"),
      notes: z.string().describe("Descrição do cupom (obrigatório na API v1)"),
      maxRedeems: z.number().default(-1).describe("Quantidade máxima de usos (-1 para ilimitado)"),
      metadata: z.record(z.unknown()).optional().describe("Metadados adicionais do cupom"),
    },
    async (params, extra) => {
      const { apiKey, code, discountKind, discount, notes, maxRedeems, metadata } = params as any;
      try {
        const requestBody: Record<string, unknown> = {
          code,
          discountKind,
          discount,
          notes,
          maxRedeems,
        };

        if (metadata) {
          requestBody.metadata = metadata;
        }

        const response = await makeAbacatePayRequest<any>({
          version: "v1",
          path: "/coupon/create",
          apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(requestBody),
        });

        const data = response.data;

        const discountText =
          data.discountKind === "PERCENTAGE"
            ? `${data.discount}%`
            : `R$ ${(data.discount / 100).toFixed(2)}`;

        const maxRedeemsText = data.maxRedeems === -1 ? "Ilimitado" : `${data.maxRedeems} vezes`;

        return {
          content: [
            {
              type: "text",
              text:
                `🎫 **Cupom criado com sucesso!**\n\n` +
                `📋 **Detalhes do Cupom:**\n` +
                `• Código: **${data.code}**\n` +
                `• Desconto: ${discountText} (${data.discountKind === "PERCENTAGE" ? "Porcentagem" : "Valor Fixo"})\n` +
                `• Usos Máximos: ${maxRedeemsText}\n` +
                `• Descrição: ${data.notes || "Sem descrição"}\n\n` +
                `✅ O cupom **${data.code}** está pronto para ser usado pelos seus clientes!`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao criar cupom: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "listCoupons",
    "Lista todos os cupons de desconto criados no Abacate Pay (API v1 — requer chave v1).",
    {
      apiKey: apiKeyParam("v1"),
    },
    async (params, extra) => {
      const { apiKey } = params as any;
      try {
        const response = await makeAbacatePayRequest<any>({
          version: "v1",
          path: "/coupon/list",
          apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });

        if (!response.data || response.data.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Nenhum cupom encontrado.",
              },
            ],
          };
        }

        const couponsList = response.data.map((coupon: any, index: number) => {
          const discountText =
            coupon.discountKind === "PERCENTAGE"
              ? `${coupon.discount}%`
              : `R$ ${(coupon.discount / 100).toFixed(2)}`;

          const maxRedeemsText =
            coupon.maxRedeems === -1 ? "Ilimitado" : `${coupon.maxRedeems} vezes`;

          return `${index + 1}. 🎫 **${coupon.id || coupon.code}**
     💰 Desconto: ${discountText} (${coupon.discountKind === "PERCENTAGE" ? "Porcentagem" : "Valor Fixo"})
     🔄 Usos: ${maxRedeemsText}
     📝 Descrição: ${coupon.notes || "Sem descrição"}`;
        }).join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `🎫 **Lista de Cupons** (${response.data.length} encontrado(s)):\n\n${couponsList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao listar cupons: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            },
          ],
        };
      }
    }
  );
}
