# Abacate Pay MCP Server

Servidor [MCP](https://modelcontextprotocol.io) para usar a [API v2 da Abacate Pay](https://docs.abacatepay.com/pages/reference/introduction) no **Claude**, no **Cursor** ou por **URL remota** (Claude.ai, automações, outras integrações).

**Conteúdo:** [Início rápido](#início-rápido) · [Como rodar o servidor](#como-rodar-o-servidor) · [Conectar via OAuth (Claude.ai / remoto)](#conectar-via-oauth-claudeai--remoto) · [Ferramentas](#ferramentas) · [Problemas comuns](#problemas-comuns)

---

## Início rápido

**Pré-requisito:** [Bun](https://bun.sh) 1.x.

```bash
git clone https://github.com/AbacatePay/abacatepay-mcp.git
cd abacatepay-mcp
bun install
```

**Chave de API:** [Abacate Pay](https://www.abacatepay.com) → **Integrar** → **API Keys**. Use uma chave de **API v2** — é a única versão suportada por este servidor.

**Claude Desktop / Cursor** (modo local, processo próprio):

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

Muitas ferramentas também aceitam `apiKey` na própria chamada, para usar outra chave quando precisar (útil para operar em modo teste e produção sem trocar a configuração).

---

## Como rodar o servidor

Escolha **uma** opção.

### No seu computador com Cursor ou Claude Desktop (o mais simples)

O próprio app **liga** o servidor para você via stdio (`bun run src/index.ts`). Você só configura o caminho e a variável `ABACATE_PAY_API_KEY`, como no [início rápido](#início-rápido). Não precisa de URL, porta ou OAuth.

### Na internet (HTTP) — Claude.ai, n8n, automações

Use o endpoint público quando você integra com Claude.ai (conector remoto), n8n, outras automações, ou quer configuração remota no cliente (sem `command`/processo local).

| Onde roda | Endereço |
|-----------|----------|
| Servidor público Abacate Pay | `https://mcp.abacatepay.com/mcp` |

Esse endpoint aceita dois modos de autenticação:

1. **`Authorization: Bearer <chave-v2>`** (ou header `X-API-Key`) diretamente — simples para clientes que já guardam a chave (n8n, scripts, Cursor apontando para a URL).
2. **OAuth 2.0** — obrigatório para o **conector remoto do Claude.ai**, que não aceita headers estáticos e exige um fluxo de autorização. Veja a seção abaixo.

Exemplo de configuração remota (Cursor, com header direto):

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

### Local, servindo HTTP (para testar OAuth ou o modo multi-tenant)

```bash
bun run src/http-server.ts
# porta padrão 3000; ajuste com MCP_PORT ou PORT
```

---

## Conectar via OAuth (Claude.ai / remoto)

O servidor implementa um Authorization Server OAuth 2.0 completo (Dynamic Client Registration + Authorization Code + PKCE), necessário porque **o conector remoto do Claude.ai exige OAuth** — não é possível conectar apenas com um header estático nesse cliente.

Fluxo, do ponto de vista do Claude/cliente MCP:

1. O cliente descobre os metadados em `/.well-known/oauth-protected-resource` e `/.well-known/oauth-authorization-server`.
2. Registra-se dinamicamente em `POST /register` (RFC 7591).
3. Abre `GET /authorize` no navegador do usuário — uma página simples pede a **chave de API v2** da Abacate Pay (não uma senha de conta).
4. Após validar a chave contra a API (`GET /v2/stores/get`), o servidor emite um código de autorização e redireciona de volta ao cliente.
5. O cliente troca o código por um token em `POST /token` (com verificação PKCE). O "token" retornado é, na prática, a própria chave de API v2, guardada de forma criptografada (AES-256-GCM) no SQLite do servidor até esse ponto.
6. O cliente usa esse token como `Authorization: Bearer` normalmente em `/mcp`.

Não há conta de usuário nem senha do Abacate Pay envolvida — apenas a chave de API do lojista, o mesmo modelo de autenticação usado no header direto.

**Configuração de produção (Fly.io):** o banco de dados OAuth (SQLite) precisa de um volume persistente e de uma chave de criptografia fixa:

```bash
fly volumes create oauth_data --size 1 --region gru
fly secrets set OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

Isso já está configurado em `fly.toml` (`OAUTH_DB_PATH=/data/oauth.db`, montado no volume `oauth_data`). Localmente, se `OAUTH_ENCRYPTION_KEY` não estiver definida, uma chave é gerada e persistida ao lado do banco (`oauth.key`), com aviso no console.

---

## Ferramentas

Nomes exatos das tools são os registrados no código (`src/tools/`); a lista completa aparece no cliente MCP ao conectar. Resumo por recurso:

| Recurso | Tools |
|---|---|
| Clientes | `createCustomer`, `listCustomers`, `getCustomer`, `deleteCustomer` |
| Cupons | `createCoupon`, `listCoupons`, `getCoupon`, `deleteCoupon`, `toggleCoupon` |
| Produtos | `createProduct`, `listProducts`, `getProduct`, `deleteProduct` |
| Checkouts (pagamento único) | `createCheckout`, `listCheckouts`, `getCheckout`, `deleteCheckout`, `refundCheckout` |
| Links de pagamento (reutilizáveis) | `createPaymentLink`, `listPaymentLinks`, `getPaymentLink`, `deletePaymentLink`, `refundPaymentLink` |
| Checkout transparente (PIX/Boleto) | `createTransparentPix`, `createTransparentBoleto`, `getTransparent`, `checkTransparentPix`, `simulateTransparentPixPayment`, `listTransparent`, `refundTransparent` |
| Payouts (saque para a própria chave Pix) | `createPayout`, `getPayout`, `listPayouts` |
| Envio de Pix (para terceiros) | `sendPix`, `getPixTransaction`, `listPixTransactions` |
| Assinaturas | `createSubscription`, `listSubscriptions`, `getSubscription`, `cancelSubscription`, `changeSubscriptionPlan`, `recordSubscriptionUsage` |
| Loja | `getStore`, `listStores` |
| Webhooks | `createWebhook`, `listWebhooks`, `getWebhook`, `deleteWebhook` |

Implementação: um arquivo por recurso em `src/tools/` (ex.: `src/tools/checkouts.ts`).

**Notas importantes de negócio, refletidas nas ferramentas:**
- Reembolsos (`refund*`) são sempre integrais — a API v2 não suporta reembolso parcial.
- `checkTransparentPix` e `simulateTransparentPixPayment` funcionam apenas para PIX; boleto não tem simulação de pagamento.
- `simulateTransparentPixPayment` só funciona com uma chave de **teste** (modo dev).
- `listPixTransactions`/`getPixTransaction` exigem `id`; a API não pagina nem filtra por status nesse endpoint.
- `changeSubscriptionPlan` e `cancelSubscription` são irreversíveis; não há suporte a pró-rata no cancelamento.

## Ideias de prompts

- Produto + checkout: *"Crie um produto 'Consultoria' de R$ 150 e um checkout PIX+cartão para ele."*
- Cupom para campanha: *"Crie um cupom 15% com código ALEX15, máximo 100 usos."*
- Conferir vendas: *"Liste os checkouts pagos dos últimos 7 dias e resuma valores."*
- Assinatura: *"Crie um produto mensal de R$ 49 e uma assinatura para o cliente X."*

---

## Problemas comuns

| Situação | O que verificar |
|----------|------------------|
| Erro de API key | Cursor/Claude local: `ABACATE_PAY_API_KEY` no `env` da config. HTTP: header `Authorization` ou `X-API-Key`, ou conecte via OAuth. |
| MCP não conecta (local) | Caminho absoluto para `src/index.ts`, Bun instalado, reiniciar o app após mudar config. |
| Claude.ai não conecta (remoto) | Confirme que está usando o fluxo OAuth (o conector do Claude.ai exige `/authorize`); não funciona apenas com header estático nesse cliente específico. |
| Bun não encontrado | `bun --version`; instalação em [bun.sh](https://bun.sh). |
| 401/403 em uma tool | A chave precisa ser de **API v2**; chaves v1 antigas não funcionam mais neste servidor. |

---

## Contribuição e licença

- Contribuição: [CONTRIBUTING.md](CONTRIBUTING.md)
- Licença: [LICENSE](LICENSE) (MIT)
