import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCustomerTools } from "./customer";
import { registerBillingTools } from "./billing";
import { registerPixTools } from "./pix";
import { registerCouponTools } from "./coupon";

export function registerAllTools(server: McpServer): void {
  registerCustomerTools(server);
  registerBillingTools(server);
  registerPixTools(server);
  registerCouponTools(server);
}

