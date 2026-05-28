# Abacate Pay MCP Server

Servidor [MCP](https://modelcontextprotocol.io) para usar a [API Abacate Pay](https://www.abacatepay.com) no **Cursor**, no **Claude Desktop** ou por **URL** (integrações). Inclui ferramentas **v1** e **v2** no mesmo processo.

**Conteúdo:** [Início rápido](#início-rápido) · [API v1 e v2](#api-v1-e-v2) · [Como rodar o servidor](#como-rodar-o-servidor) · [Ferramentas](#ferramentas-resumo) · [Problemas comuns](#problemas-comuns)

---

## Início rápido

**Pré-requisito:** [Bun](https://bun.sh) 1.x.

```bash
git clone https://github.com/AbacatePay/abacatepay-mcp.git
cd abacatepay-mcp
bun install
```

**Chave de API:** [Abacate Pay](https://www.abacatepay.com) → **Integrar** → **API Keys**.

**Claude Desktop**

```json
{
  "mcpServers": {
    "abacate-pay": {
      "command": "bun",
      "args": ["/CAMINHO/absoluto/para/abacatepay-mcp/src/index.ts"],
      "env": {
        "ABACATE_PAY_API_KEY": "sua_chave"
      }
    }
  }
}
```

**Cursor**

```json
{
  "mcp.servers": {
    "abacate-pay": {
      "command": "bun",
      "args": ["/CAMINHO/absoluto/para/abacatepay-mcp/src/index.ts"],
      "env": {
        "ABACATE_PAY_API_KEY": "sua_chave"
      }
    }
  }
}
```

- A chave em `ABACATE_PAY_API_KEY` deve ser **v1 ou v2** de acordo com o que você usa ([tabela abaixo](#api-v1-e-v2)). Muitas ferramentas também aceitam `apiKey` na própria chamada, para usar outra chave quando precisar.

---

## API v1 e v2

| | URL base | Ferramentas MCP | Chave |
|--|----------|-----------------|--------|
| **v2** | `https://api.abacatepay.com/v2` | Prefixo **`v2`** (`v2CreateCheckout`, `v2ListCustomers`, `v2CreateProduct`, …) | Chave criada para **v2** |
| **v1** | `https://api.abacatepay.com/v1` | Nomes **sem** prefixo `v2` (`createCustomer`, `createBilling`, `listBillings`, `createPixQrCode`, `createCoupon`, `createWithdraw`, `listWithdraw`, `getWithdraw`, …) | Chave criada para **v1** |

Chaves **não** são intercambiáveis: uso errado tende a responder com *version mismatch*. O servidor tenta acrescentar uma dica nesses erros.

**Especificação (fonte de verdade para campos e rotas):**

- v1: [openapi-v1.yaml](https://github.com/AbacatePay/documentation/blob/main/openapi-v1.yaml)
- v2: [openapi.yaml](https://github.com/AbacatePay/documentation/blob/main/openapi.yaml)

---

## Como rodar o servidor

Escolha **uma** opção. Para Cursor ou Claude no dia a dia, a primeira é quase sempre a certa.

### No seu computador com Cursor ou Claude (o mais simples)

O próprio app **liga** o servidor para você. Você só configura o caminho do `src/index.ts` e a variável `ABACATE_PAY_API_KEY` (como no [início rápido](#início-rápido)).

**Em resumo:** colou a config, pôs a chave, ajustou o caminho, pronto. Não precisa configurar URL, porta ou “modo HTTP”.

### Na internet (HTTP) — MCP remoto, automações e outras ferramentas

Use o endpoint público quando você integra com n8n, outras automações ou quer **configuração remota** no cliente (sem `command` / processo local).

| Onde roda | Endereço |
|-----------|----------|
| Servidor público Abacate Pay | `https://mcp.abacatepay.com/mcp` |

**Cursor e Claude Code:** também dá para usar o MCP apontando para essa URL e enviando a chave nos headers (multi-tenant ou sem variável `ABACATE_PAY_API_KEY` no seu disco). Exemplo para o Cursor:

```json
{
  "mcpServers": {
    "abacatepay": {
      "url": "https://mcp.abacatepay.com/mcp",
      "headers": {
        "Authorization": "Bearer API_KEY"
      }
    }
  }
}
```

Troque `API_KEY` pela sua chave ([Integrar](https://www.abacatepay.com) → **API Keys**) — **v1** ou **v2**, alinhada às ferramentas que você usa. O servidor HTTP também aceita `X-API-Key` em vez de `Authorization`, se o seu cliente preferir. No Claude Code, o formato é o mesmo conceito (URL + headers); confira o arquivo de configuração do produto para o nome exato da chave no JSON.

---

## Ferramentas (resumo)

- **v2:** clientes, cupons, produtos, checkouts (criar/listar/obter/reembolsar), links de pagamento (criar/listar/obter/reembolsar), Pix transparente (criar/checar/simular/listar/reembolsar), payouts, envio Pix, assinaturas (checkout/listar/cancelar/trocar plano/registrar uso), webhooks (criar/listar/obter/deletar), loja e métricas públicas. Implementação: `src/tools/v2/`.
- **v1:** clientes (`/customer/*`), cobranças (`/billing/*`), QR Pix (`/pixQrCode/*`), cupons (`/coupon/*`), saques (`/withdraw/*`). Implementação: `src/tools/*.ts` (exceto `v2/`).

Nomes exatos das tools são os registrados no código; a lista completa aparece no cliente MCP ao conectar.

---

## Ideias de prompts

- Cupom para campanha: *"Crie um cupom 15% com código ALEX15, máximo 100 usos."*
- Conferir cobranças: *"Liste as cobranças recentes e resuma status e valores."*
- Cliente + Pix (v1): *"Cadastre o cliente X e gere um Pix de R$ 10."*

Para fluxos v2, mencione produtos cadastrados e use ferramentas `v2*` (ex.: checkout com `items` de produtos já criados).

---

## Problemas comuns

| Situação | O que verificar |
|----------|------------------|
| Erro de API key | Cursor/Claude: `ABACATE_PAY_API_KEY` no `env` da config. HTTP: header `Authorization` ou `X-API-Key`. |
| *Version mismatch* | Chave v1 só com tools sem `v2`; chave v2 só com tools `v2*`. |
| MCP não conecta | Caminho absoluto para `src/index.ts`, Bun instalado, reiniciar o app após mudar config. |
| Bun não encontrado | `bun --version`; instalação em [bun.sh](https://bun.sh). |

---

## Contribuição e licença

- Contribuição: [CONTRIBUTING.md](CONTRIBUTING.md)
- Licença: [LICENSE](LICENSE) (MIT)
