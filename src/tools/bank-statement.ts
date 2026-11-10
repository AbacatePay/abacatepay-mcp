import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

const transactionStatus = z.enum([
  "PENDING",
  "APPROVED",
  "EXPIRED",
  "CANCELLED",
  "COMPLETE",
  "REFUNDED",
  "REDEEMED",
  "UNDER_DISPUTE",
  "FAILED",
]);

function movement(m: any): string {
  const value = `R$ ${(Math.abs(m.amount) / 100).toFixed(2)}`;
  const signed = m.balanceEffect === "credit" ? `+${value}` : m.balanceEffect === "debit" ? `-${value}` : value;
  return `${signed} ${m.description}`;
}

export function registerBankStatementTools(server: McpServer) {
  server.tool(
    "listBankStatement",
    "Extrato da loja: cada transação com os movimentos que ela fez no saldo (entrada, taxa, saque, reembolso, estorno), do mais novo para o mais antigo. Sem filtro de status, vêm todas menos PENDING.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      status: transactionStatus.optional(),
      method: z.enum(["PIX", "CARD", "PIX_QRCODE", "BOLETO", "INTERNAL", "TED"]).optional(),
      kind: z.string().optional().describe("Tipo da transação, ex.: DEPOSIT, CARD_APPROVED, WITHDRAW, REFUND."),
      search: z.string().optional().describe("Parte do ID da transação."),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      endDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/bank-statement/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            status: p.status,
            method: p.method,
            kind: p.kind,
            search: p.search,
            startDate: p.startDate,
            endDate: p.endDate,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data
            ?.map((item: any, i: number) => {
              const movements = (item.movements ?? []).map(movement).join("; ") || "sem movimento";
              const ref = item.checkoutId ?? item.paymentIntentId ?? item.referenceId;
              return `${i + 1}. ${item.createdAt} — ${item.id}${ref ? ` (${ref})` : ""} — ${movements}`;
            })
            .join("\n") || "Nenhuma transação.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
