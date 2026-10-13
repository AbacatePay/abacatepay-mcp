---
"abacatepay-mcp": minor
---

Endurece o fluxo OAuth do servidor HTTP.

- `issuer` e URLs dos `/.well-known` vêm de `MCP_PUBLIC_URL` (padrão `https://mcp.abacatepay.com`), não mais de `Host`/`X-Forwarded-*`.
- O `POST /token` devolve um token opaco (`mcp_at_…`) em vez da chave de API; `/mcp` resolve o token para a chave, e `POST /revoke` passa a invalidá-lo. Chave de API direto no header continua aceita, então quem já está conectado não precisa reconectar.
- Página de consentimento mostra o nome do aplicativo e o destino do acesso, com aviso do que a chave permite, e o formulário tem token CSRF.
- `POST /register` valida `redirect_uris` (https, http só em loopback, esquemas de app nativo; sem credenciais, fragmento, `javascript:`/`data:`/`file:`) e não emite mais `client_secret`, que nunca era conferido.
- Rate limit do `POST /authorize` usa `Fly-Client-IP` (e `CF-Connecting-IP` só quando a requisição veio da Cloudflare), nunca `X-Forwarded-For`; o mapa de tentativas é limpo periodicamente e tem teto.
- Validação da chave aceita só `200`; erro da API vira "tente de novo" em vez de emitir código.
- PKCE comparado em tempo constante.
