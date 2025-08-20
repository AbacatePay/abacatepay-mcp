import "./config.js";
import express from "express";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerAllTools } from "./tools/index.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "abacatepay-mcp",
    version: "1.0.0",
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
    app.use((express as any).json({ limit: '10mb' }));

    // Map to store transports by session ID
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Handle POST requests for client-to-server communication
    app.post('/mcp', async (req: Request, res: Response) => {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest((req as any).body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            transports[sessionId] = transport;
          },
          // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
          // locally, make sure to set:
          // enableDnsRebindingProtection: true,
          // allowedHosts: ['127.0.0.1'],
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        const server = createServer();

        // Connect to the MCP server
        await server.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, (req as any).body);
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };

    // Handle GET requests for server-to-client notifications via SSE
    app.get('/mcp', handleSessionRequest);

    // Handle DELETE requests for session termination
    app.delete('/mcp', handleSessionRequest);

    // Get port from environment or use default
    const port = parseInt(process.env.MCP_PORT || process.env.PORT || "3000");

    app.listen(port, () => {
      console.error(`🚀 Abacate Pay MCP Server rodando em http://localhost:${port}`);
      console.error(`📡 Endpoint: http://localhost:${port}/mcp`);
      console.error(`📖 Documentação: http://localhost:${port}/mcp/schema`);
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.error('\n🛑 Encerrando servidor...');
      // Close all active transports
      for (const transport of Object.values(transports)) {
        await transport.close();
      }
      process.exit(0);
    });

  } catch (error) {
    console.error("Erro fatal em main():", error);
    process.exit(1);
  }
}

main();
