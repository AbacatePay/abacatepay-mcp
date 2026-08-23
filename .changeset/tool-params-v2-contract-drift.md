---
"abacatepay-mcp": minor
---

Alinha os parâmetros dos tools com os contratos reais da API v2.

- `startDate`/`endDate` em `listCoupons`, `listCustomers`, `listProducts`, `listSubscriptions`, `listPayouts`, `listTransparent`, `listWebhooks` e `listStores` — as oito rotas já repassavam o intervalo via `paginationFromQuery`, mas os tools não expunham os campos.
- `listCustomers` aceita `name` e `cellphone`.
- `createSubscription` aceita `card`, `upSellProductId`, `interest`, `fine` e `dueDate`, que o corpo da assinatura herda de `CreateCheckoutBody`.
- `createCoupon` aceita `startsAt` e `expiresAt`, e deixa de enviar `metadata`, campo ausente de `CreateCouponBody` e herdado do `CouponV1` legado.
