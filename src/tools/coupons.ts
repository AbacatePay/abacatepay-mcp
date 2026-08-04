import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, paginationHint, toolError } from "./shared.js";

const couponStatus = z.enum(["ACTIVE", "DELETED", "DISABLED"]);

export function registerCouponTools(server: McpServer) {
  server.tool(
    "createCoupon",
    "Cria cupom de desconto.",
    {
      apiKey: apiKeyParam(),
      code: z.string(),
      discountKind: z.enum(["PERCENTAGE", "FIXED"]),
      discount: z.number(),
      notes: z.string().optional(),
      maxRedeems: z.number().optional().describe("-1 para ilimitado. Padrão: -1 se omitido."),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const body: Record<string, unknown> = {
          code: p.code,
          discountKind: p.discountKind,
          discount: p.discount,
          // The API requires maxRedeems in the body; -1 (unlimited) is a sane default when omitted.
          maxRedeems: p.maxRedeems ?? -1,
        };
        if (p.notes != null) body.notes = p.notes;
        if (p.metadata) body.metadata = p.metadata;

        const res = await makeAbacatePayRequest<any>({
          path: "/coupons/create",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify(body),
        });
        const d = res.data;
        return {
          content: [{ type: "text", text: `Cupom: ${d.id} — ${d.discountKind} ${d.discount} — ${d.status}` }],
        };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "listCoupons",
    "Lista cupons.",
    {
      apiKey: apiKeyParam(),
      after: z.string().optional(),
      before: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      id: z.string().optional(),
      status: couponStatus.optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/coupons/list${buildQuery({
            after: p.after,
            before: p.before,
            limit: p.limit,
            id: p.id,
            status: p.status,
          })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "GET",
        });
        const rows =
          res.data?.map((c: any, i: number) => `${i + 1}. ${c.id} — ${c.discountKind} — ${c.status}`).join("\n") ||
          "Nenhum cupom.";
        return { content: [{ type: "text", text: `${rows}${paginationHint(res.pagination)}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "getCoupon",
    "Busca cupom por id.",
    {
      apiKey: apiKeyParam(),
      id: z.string().optional(),
      status: couponStatus.optional(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/coupons/get${buildQuery({ id: p.id, status: p.status })}`,
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
    "deleteCoupon",
    "Remove cupom.",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: `/coupons/delete${buildQuery({ id: p.id })}`,
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: "{}",
        });
        return { content: [{ type: "text", text: `Cupom removido: ${res.data?.id ?? p.id}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    "toggleCoupon",
    "Alterna cupom entre ativo (ACTIVE) e desativado (DISABLED).",
    {
      apiKey: apiKeyParam(),
      id: z.string(),
    },
    async (params, extra) => {
      const p = params as any;
      try {
        const res = await makeAbacatePayRequest<any>({
          path: "/coupons/toggle",
          apiKey: p.apiKey,
          sessionId: extra.sessionId,
          method: "POST",
          body: JSON.stringify({ id: p.id }),
        });
        return { content: [{ type: "text", text: `Status: ${res.data?.status}` }] };
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
