# abacatepay-mcp

## 3.0.0

### Major Changes

- 848f40c: Servidor migrado inteiramente para a API v2 (`https://api.abacatepay.com/v2`); a API v1 e suas tools foram removidas.

  **Breaking changes:**

  - Removidas as tools v1: `createCustomer`, `listCustomers`, `createBilling`, `listBillings`, `createPixQrCode`, `simulatePixPayment`, `checkPixStatus`, `createCoupon`, `listCoupons`, `createWithdraw`, `listWithdraw`, `getWithdraw`.
  - O prefixo `v2` foi removido de todas as tools (ex.: `v2CreateCustomer` → `createCustomer`, `v2CreateProduct` → `createProduct`). Como não há mais ambiguidade de versão, os nomes agora são diretos por recurso.

  **Correções de bugs (validados contra a implementação real do backend):**

  - `getStore` chamava `/store/get` (rota inexistente); corrigido para `/stores/get`.
  - `refundCheckout`/`refundPaymentLink`/`refundTransparent` liam um campo `refundPublicId` que não existe na resposta; corrigido para ler `id`.
  - `createPayout` nunca enviava a chave Pix de destino (`pix: {type, key}`), então todo payout falhava; corrigido.
  - `toggleCoupon` enviava `id` como query string; a API espera `id` no corpo da requisição.
  - Enum de status de cupom corrigido de `ACTIVE|INACTIVE|EXPIRED` para `ACTIVE|DELETED|DISABLED`.
  - `getPixTransaction`/`listPixTransactions` agora exigem `id` (a API real não aceita apenas `externalId`); parâmetros de paginação/status inexistentes no endpoint real foram removidos.

  **Novas tools** (endpoints reais que não tinham cobertura): `deleteCheckout`, `deletePaymentLink`, `getTransparent`, `createTransparentBoleto`, `getSubscription`, `listStores`.

  **Outras melhorias:** produtos agora aceitam `cycle: DAILY|QUARTERLY` (faltavam), `trialDays`, `image`, `fileUrl`; checkouts/links de pagamento aceitam `card`, `interest`, `fine`, `dueDate`, `upSellProductId` e filtros de listagem corretos (`customerId`, `method`, `keyword`, `startDate`, `endDate`); assinaturas aceitam `retryPolicy`; webhooks ganharam os eventos `subscription.plan_changed` e `subscription.payment_failed`.

  Removidas as tools de MRR público (`getMerchantInfo`, `getMrr`, `getRevenue`): esses endpoints exigem um token especial (`mrr_...`), não a chave de API normal da loja, e sempre retornariam 401 para a maioria dos usuários.

## 1.0.7

### Major Changes

- Refatoração completa do código para melhor organização e manutenibilidade
  - Modularização: Funções utilitárias movidas para `src/utils/` (formatters, api-key, errors)
  - Middleware HTTP movido para `src/http/middleware.ts`
  - HTTP server reorganizado para `src/http/server.ts`
  - Sistema de contexto de API key implementado em todas as ferramentas
  - Tratamento de erros padronizado em todas as ferramentas

## 1.0.5

### Patch Changes

- 7502e34: Corrige problema de dependências faltando ao executar via NPX

  - Implementa bundling com esbuild para incluir todas as dependências em um único arquivo
  - Resolve erro "Cannot find package '@modelcontextprotocol/sdk'"
  - Agora funciona perfeitamente com `npx abacatepay-mcp` sem necessidade de instalação manual
  - Bundle otimizado de ~261KB incluindo todas as dependências necessárias

## 1.0.4

### Patch Changes

- bff91cb: Corrige compatibilidade com Node.js 18+

  - Atualiza requisito do Node.js de >=22.16.0 para >=18.19.1
  - Adiciona shebang correto no arquivo executável
  - Melhora compatibilidade com a maioria das instalações do Node.js

## 1.0.2

### Patch Changes

- f020ec1: Migra sistema de release do release-it para Changesets. Isso melhora o processo de contribuição permitindo que contribuidores documentem suas próprias mudanças e facilita o gerenciamento de releases para mantenedores.
