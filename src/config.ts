// Configurações do Abacate Pay para ambiente Cloudflare Workers.
// Workers não possuem process.env como no Node, então a API key global
// deve ser fornecida via Secrets do Wrangler (env.ABACATE_PAY_API_KEY)
// ou passada por parâmetro em cada chamada de tool.

export const ABACATE_PAY_API_BASE = "https://api.abacatepay.com/v1";
export const USER_AGENT = "abacatepay-mcp/1.0";

// Em ambiente Workers, acessaremos a chave global (se existir) via bindings/env
// durante a requisição. Como esta função pode ser chamada sem contexto de request,
// deixamos que callers passem a apiKey explicitamente. Para compatibilidade,
// tentamos ler de globalThis se um adaptador preencher.
export function validateApiKey(): string {
  // Em modo multi-tenant, a chave deve sempre ser fornecida pelo usuário
  const maybeGlobal = (globalThis as any)?.ABACATE_PAY_API_KEY as
    | string
    | undefined;
  
  if (!maybeGlobal) {
    throw new Error(
      "❌ Chave de API não fornecida. Configure no Cursor:\n" +
      "• URL: https://SEU_WORKER.workers.dev/mcp?key=SUA_CHAVE\n" +
      "• SSE: https://SEU_WORKER.workers.dev/sse?key=SUA_CHAVE"
    );
  }
  
  return maybeGlobal;
}


