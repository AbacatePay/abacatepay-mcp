import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerV2CheckoutTools } from "./checkouts.js";
import { registerV2CouponTools } from "./coupons.js";
import { registerV2CustomerTools } from "./customers.js";
import { registerV2PaymentLinkTools } from "./payment-links.js";
import { registerV2PayoutTools } from "./payouts.js";
import { registerV2PixSendTools } from "./pix-send.js";
import { registerV2ProductTools } from "./products.js";
import { registerV2StoreTools } from "./store.js";
import { registerV2SubscriptionTools } from "./subscriptions.js";
import { registerV2TransparentTools } from "./transparents.js";
import { registerV2WebhookTools } from "./webhooks.js";

/** Registra ferramentas que chamam apenas https://api.abacatepay.com/v2 (chave API v2). */
export function registerV2Tools(server: McpServer) {
  registerV2CustomerTools(server);
  registerV2CouponTools(server);
  registerV2ProductTools(server);
  registerV2CheckoutTools(server);
  registerV2PaymentLinkTools(server);
  registerV2TransparentTools(server);
  registerV2PayoutTools(server);
  registerV2PixSendTools(server);
  registerV2SubscriptionTools(server);
  registerV2StoreTools(server);
  registerV2WebhookTools(server);
}
