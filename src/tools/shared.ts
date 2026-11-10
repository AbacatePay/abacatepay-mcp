import { z } from "zod";

const API_KEY_DESC =
  "Override opcional. Em HTTP multi-tenant prefira Authorization ou X-API-Key; em stdio use ABACATE_PAY_API_KEY.";

/** Optional zod schema for the `apiKey` parameter. */
export function apiKeyParam() {
  return z.string().optional().describe(API_KEY_DESC);
}

/** Status de um checkout (`bill_...`): pagamento único, link de pagamento ou checkout de assinatura. */
export const checkoutStatus = z.enum([
  "PENDING",
  "EXPIRED",
  "CANCELLED",
  "PAID",
  "UNDER_DISPUTE",
  "REFUNDED",
  "ACTIVE",
  "REDEEMED",
]);

/** Métodos que filtram checkouts no get/list. */
export const checkoutMethodFilter = z.enum(["PIX", "CRYPTO", "CARD", "BOLETO", "GOOGLE_PAY", "APPLE_PAY"]);

/** Opções de cartão do checkout e do link de pagamento. */
export const cardOptions = z
  .object({
    maxInstallments: z.number().int().min(1).max(12),
    passFeesToCustomer: z
      .boolean()
      .optional()
      .describe(
        "O cliente paga a taxa do cartão: o acréscimo volta em customerFee. Exige CARD em methods e a loja com cartão pela Rinne."
      ),
  })
  .strict();

export const metadataStrings = z
  .record(z.string(), z.string())
  .describe("Pares chave/valor; os valores precisam ser texto.");

export type Pagination = {
  hasMore?: boolean;
  next?: string | null;
  before?: string | null;
};

export function paginationHint(pagination: Pagination | undefined): string {
  if (!pagination) return "";
  const parts: string[] = [];
  if (pagination.hasMore && pagination.next) {
    parts.push(`Próxima página: use after="${pagination.next}".`);
  }
  if (pagination.before) {
    parts.push(`Anterior: before="${pagination.before}".`);
  }
  return parts.length ? `\n\n📄 **Paginação:** ${parts.join(" ")}` : "";
}

export function buildQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function toolError(e: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: e instanceof Error ? e.message : "Erro desconhecido",
      },
    ],
  };
}
