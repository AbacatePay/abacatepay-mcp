import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCustomerTools } from "./customer.js";
import { registerBillingTools } from "./billing.js";
import { registerPixTools } from "./pix.js";
import { registerCouponTools } from "./coupon.js";
import { registerWithdrawTools } from "./withdraw.js";

export function registerAllTools(server: McpServer) {
  registerCustomerTools(server);
  registerBillingTools(server);
  registerPixTools(server);
  registerCouponTools(server);
  registerWithdrawTools(server);
} 