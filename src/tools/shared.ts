import { z } from "zod";

export type ApiVersion = "v1" | "v2";

const API_KEY_DESC_V1 =
  "Override opcional. Em HTTP multi-tenant prefira Authorization ou X-API-Key; em stdio use ABACATE_PAY_API_KEY.";
const API_KEY_DESC_V2 =
  "Override opcional (chave v2). Em HTTP multi-tenant prefira Authorization ou X-API-Key; em stdio use uma chave v2 em ABACATE_PAY_API_KEY.";

/** Schema zod opcional do parâmetro `apiKey`, com a descrição correta por versão. */
export function apiKeyParam(version: ApiVersion) {
  const desc = version === "v2" ? API_KEY_DESC_V2 : API_KEY_DESC_V1;
  return z.string().optional().describe(desc);
}

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
