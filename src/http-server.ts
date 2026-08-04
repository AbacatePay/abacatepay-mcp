import "./config.js";
import express from "express";
import type { Request, RequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { clearSessionApiKey, setSessionApiKey } from "./context.js";
import {
  type RequestWithValidatedApiKey,
  validateApiKeyMiddleware,
} from "./http/middleware.js";
import { oauthRouter } from "./oauth/routes.js";
import { registerAllTools } from "./tools/index.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "abacatepay-mcp",
    version: "2.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  registerAllTools(server);

  return server;
}

async function main() {
  try {
    const app = express();
    app.use((express as unknown as { json: (opts?: object) => RequestHandler }).json({
      limit: "10mb",
    }));

    app.use(oauthRouter);
    app.use("/mcp", validateApiKeyMiddleware);

    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.post("/mcp", async (req: Request, res: Response) => {
      const validatedApiKey = (req as RequestWithValidatedApiKey).validatedApiKey;
      if (!validatedApiKey) {
        res.status(403).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Forbidden: missing API key" },
          id: null,
        });
        return;
      }

      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId =
        typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

      if (sessionId) {
        setSessionApiKey(sessionId, validatedApiKey);
      }

      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId) {
        transport = transports.get(sessionId);
      }

      const body = (req as Request & { body?: unknown }).body;
      if (!transport && !sessionId && body !== undefined && isInitializeRequest(body)) {
        const keyForThisTransport = validatedApiKey;
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
            setSessionApiKey(sid, keyForThisTransport);
          },
        });

        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid) {
            transports.delete(sid);
            clearSessionApiKey(sid);
          }
        };

        const server = createServer();
        await server.connect(transport);
      }

      if (!transport) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, body);
    });

    const handleSessionRequest = async (req: Request, res: Response) => {
      const validatedApiKey = (req as RequestWithValidatedApiKey).validatedApiKey;
      if (!validatedApiKey) {
        res.status(403).send("Forbidden: missing API key");
        return;
      }

      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId =
        typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
      if (!sessionId) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      setSessionApiKey(sessionId, validatedApiKey);

      const transport = transports.get(sessionId);
      if (!transport) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }
      await transport.handleRequest(req, res);
    };

    app.get("/mcp", handleSessionRequest);
    app.delete("/mcp", handleSessionRequest);

    const port = parseInt(process.env.MCP_PORT || process.env.PORT || "3000", 10);

    app.listen(port, () => {
      console.error(`🚀 Abacate Pay MCP Server rodando em http://localhost:${port}`);
      console.error(`📡 Endpoint: http://localhost:${port}/mcp`);
      console.error(`📖 Documentação: http://localhost:${port}/mcp/schema`);
    });

    process.on("SIGINT", async () => {
      console.error("\n🛑 Encerrando servidor...");
      for (const t of transports.values()) {
        await t.close();
      }
      process.exit(0);
    });
  } catch (error) {
    console.error("Erro fatal em main():", error);
    process.exit(1);
  }
}

main();
