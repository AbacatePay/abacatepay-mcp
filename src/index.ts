import "./config";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools";
import { checkRateLimit, getRateLimitIdentifier } from "./middleware/rateLimit";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "abacatepay-mcp",
		version: "1.0.0",
	});

	async init() {
		registerAllTools(this.server);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Rate limiting básico
		const rateLimitId = getRateLimitIdentifier(request);
		if (!checkRateLimit(rateLimitId)) {
			return new Response("Rate limit exceeded", { 
				status: 429,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Retry-After": "60"
				}
			});
		}

		// Multi-tenant: sempre usa a chave fornecida pelo usuário
		// Prioridade: header > query > (sem fallback para secret global)
		const headerKey = request.headers.get("x-abacatepay-key");
		const queryKey = url.searchParams.get("key");
		
		// Define a chave no escopo global para as tools usarem
		(globalThis as any).ABACATE_PAY_API_KEY = headerKey || queryKey || null;

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { 
			status: 404,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization, x-abacatepay-key"
			}
		});
	},
};
