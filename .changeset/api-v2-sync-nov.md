---
"abacatepay-mcp": minor
---

Alinha as tools com a API v2 de novembro e cobre as rotas que faltavam.

**Novas tools**

- Checkout de assinatura: `getSubscriptionCheckout`, `listSubscriptionCheckouts` e `deleteSubscriptionCheckout`. O `createSubscription` devolve um `bill_...` que nenhuma tool conseguia ler.
- Portal do cliente: `createCustomerPortal`.
- Subcontas: `createSubAccount`, `getSubAccount`, `listSubAccounts` e `withdrawSubAccount`, mais `splits` no `createTransparentPix`.
- Extrato: `listBankStatement`.

**Correções**

- `listSubscriptions` dava 422 com qualquer status. Agora aceita só `ACTIVE` e `CANCELLED`, e ganhou o filtro `checkoutId`.
- `createSubscription` não oferece mais `interest`, `fine` e `dueDate`: eles exigem boleto, que a assinatura não aceita, então toda chamada falhava.
- `getSubscription` não manda mais `method`, que a rota ignora.
- `createPaymentLink` não oferece mais `customerId`, que a API recusa em link de pagamento.
- `createProduct` não oferece mais `image`, que a API ignora. Use `imageUrl`.
- `createTransparentBoleto` exige no mínimo 300 centavos, como a API.
- `simulateTransparentPixPayment` não manda mais `metadata`, que a rota ignora.
- `getCoupon` exige `id`.
- Filtro de status de checkout e de link usa os status de checkout (`ACTIVE` entra; `APPROVED` e `FAILED` saem).

**Campos novos**

- `card.passFeesToCustomer` em `createCheckout` e `createPaymentLink`.
- `GOOGLE_PAY` e `APPLE_PAY` em `createCheckout`.
- `address` em `createCustomer`. O `metadata` do cliente aceita só texto, como a API.
- `ensureSameTaxId` no `createTransparentPix`.
- `address` do pagador no `createTransparentBoleto`.
- `src` e `sck` no `utm`.

**Descrições**

- `sendPix` diz que a chave não pode ser da própria loja e que repetir o `externalId` devolve o envio já feito.
- `createPayout` diz que a chave tem que estar no CNPJ da loja e que repetir o `externalId` não é deduplicado.
