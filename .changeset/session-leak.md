---
"abacatepay-mcp": patch
---

As sessões do `/mcp` expiram: a que fica parada mais de 30 minutos é fechada (`MCP_SESSION_IDLE_TTL_MS`) e, acima de 100 sessões abertas (`MCP_MAX_SESSIONS`), abrir uma nova fecha a mais parada. Antes elas só saíam com `DELETE`, que os clientes quase nunca mandam, e cada uma segurava um servidor MCP inteiro na memória até a máquina parar de atender. O cliente que tiver a sessão fechada recebe `404` e abre outra sozinho. Novo `GET /health` com sessões abertas e memória, usado como health check no Fly.
