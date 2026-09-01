import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCheckoutTools } from "./checkouts.js";
import { registerCouponTools } from "./coupons.js";
import { registerCustomerTools } from "./customers.js";
import { registerPaymentLinkTools } from "./payment-links.js";
import { registerPayoutTools } from "./payouts.js";
import { registerPixSendTools } from "./pix-send.js";
import { registerProductTools } from "./products.js";
import { registerReportTools } from "./reports.js";
import { registerStoreTools } from "./store.js";
import { registerSubscriptionTools } from "./subscriptions.js";
import { registerTransparentTools } from "./transparents.js";
import { registerWebhookTools } from "./webhooks.js";

/** Registers all MCP tools (Abacate Pay API v2). */
export function registerAllTools(server: McpServer) {
  registerCustomerTools(server);
  registerCouponTools(server);
  registerProductTools(server);
  registerCheckoutTools(server);
  registerPaymentLinkTools(server);
  registerTransparentTools(server);
  registerPayoutTools(server);
  registerPixSendTools(server);
  registerSubscriptionTools(server);
  registerStoreTools(server);
  registerWebhookTools(server);
  registerReportTools(server);
}
