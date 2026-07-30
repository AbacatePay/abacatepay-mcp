import minimist from "minimist";

const argv = minimist(process.argv.slice(2));

// API key can be provided globally (legacy mode) or per request (multi-tenant mode)
export const apiKey = argv.key || process.env.ABACATE_PAY_API_KEY;

export function validateApiKey(): string {
  if (!apiKey) {
    console.error(
      "⚠️  Chave de API não fornecida globalmente.\n" +
      "O servidor suporta multi-tenancy e requer a chave de API em cada requisição.\n" +
      "Para usar o modo legacy (chave global), configure:\n" +
      "  1. --key sua_chave_aqui\n" +
      "  2. Variável de ambiente ABACATE_PAY_API_KEY"
    );
  }
  return apiKey || '';
}

// Só valida se estamos executando como script principal
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('index.js') ||
  process.argv[1].endsWith('dist/index.js') ||
  process.argv[1].includes('abacatepay-mcp')
);

const isHttpServerEntry = Boolean(process.argv[1]?.includes("http-server"));

if (isMainModule && !isHttpServerEntry && !process.env.NODE_ENV?.includes('test')) {
  console.error("✅ Abacate Pay MCP Server iniciado com sucesso");
  if (apiKey) {
    console.error("🔑 Modo legacy ativo - API key global configurada");
  } else {
    console.error("🔐 Multi-tenancy ativo - API keys devem ser fornecidas em cada requisição");
  }
}

export const ABACATE_PAY_API_BASE = "https://api.abacatepay.com/v2";

export const USER_AGENT = "abacatepay-mcp/2.0";
