---
"abacatepay-mcp": minor
---

Completa a cobertura da API v2 e adiciona testes.

- Novas tools v2: reembolsos (`v2RefundCheckout`, `v2RefundPaymentLink`, `v2RefundTransparentPix`), ciclo de assinatura (`v2CancelSubscription`, `v2ChangeSubscriptionPlan`, `v2RecordSubscriptionUsage`) e webhooks (`v2CreateWebhook`, `v2ListWebhooks`, `v2GetWebhook`, `v2DeleteWebhook`).
- Helpers de tool extraídos para `src/tools/shared.ts`; tools v1 passam a usar `apiKeyParam` compartilhado (sem mudança de comportamento).
- Suíte de testes `bun:test`: unit com `fetch` mockado (no CI) + smoke gated por `ABACATE_PAY_SMOKE`.
