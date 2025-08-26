import { validateApiKey, ABACATE_PAY_API_BASE, USER_AGENT } from "../config";

export async function makeAbacatePayRequest<T = unknown>(
  endpoint: string,
  apiKey?: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${ABACATE_PAY_API_BASE}${endpoint}`;

  const authKey = apiKey || validateApiKey();
  if (!authKey) {
    throw new Error(
      "Chave de API não fornecida. Forneça via parâmetro 'apiKey' na tool ou configure uma chave global.",
    );
  }

  const headers = new Headers(options.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${authKey}`);
  headers.set("Content-Type", "application/json");
  headers.set("User-Agent", USER_AGENT);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    
    // Sanitiza erros para não vazar informações sensíveis da API
    const safeError = response.status >= 500 
      ? "Erro interno do servidor. Tente novamente."
      : response.status === 401 
        ? "Chave de API inválida. Verifique suas credenciais."
        : response.status === 403
          ? "Acesso negado. Verifique as permissões da sua chave."
          : response.status === 429
            ? "Muitas requisições. Aguarde antes de tentar novamente."
            : `Erro da API (${response.status}): ${errorText.substring(0, 200)}`;
            
    throw new Error(safeError);
  }

  return response.json() as Promise<T>;
}


