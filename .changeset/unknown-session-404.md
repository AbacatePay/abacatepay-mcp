---
"abacatepay-mcp": patch
---

Sessão desconhecida no `/mcp` responde `404` em vez de `400`, como pede a spec do Streamable HTTP. As sessões ficam em memória e somem a cada deploy; com o `404` o cliente abre uma sessão nova sozinho, em vez de ficar travado até o usuário reconectar.
