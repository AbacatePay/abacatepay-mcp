import "./config.js";
import express from "express";
import type { Request, RequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";
import { setInterval } from "node:timers";
import { gc } from "bun";
import { heapStats } from "bun:jsc";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { setSessionApiKey } from "./context.js";
import {
  type RequestWithValidatedApiKey,
  validateApiKeyMiddleware,
} from "./http/middleware.js";
import { createSessionStore } from "./http/sessions.js";
import { oauthRouter } from "./oauth/routes.js";
import { registerAllTools } from "./tools/index.js";

function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "abacatepay-mcp",
      version: "2.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  registerAllTools(server);

  return server;
}

/**
 * Sessions live in memory, so every deploy/restart drops them. The spec says an
 * unknown session ID gets 404, which makes the client start a new session; a 400
 * leaves it stuck until the user reconnects.
 */
function unknownSession(res: Response): void {
  res.status(404).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Session not found" },
    id: null,
  });
}

/** Sessão parada há mais que isso é fechada (o cliente reabre sozinho ao receber 404) */
const SESSION_IDLE_TTL_MS = Number(process.env.MCP_SESSION_IDLE_TTL_MS ?? 30 * 60 * 1000);
/** Teto de sessões abertas: ~1 MB cada, numa máquina de 512 MB */
const MAX_SESSIONS = Number(process.env.MCP_MAX_SESSIONS ?? 100);
const SWEEP_INTERVAL_MS = 60 * 1000;

async function main() {
  try {
    const app = express();

    const sessions = createSessionStore<StreamableHTTPServerTransport>({
      idleTtlMs: SESSION_IDLE_TTL_MS,
      maxSessions: MAX_SESSIONS,
    });
    setInterval(async () => {
      await sessions.sweep();
      // O GC do Bun é preguiçoso: sem forçar, o que foi fechado continua ocupando memória e a
      // máquina enche do mesmo jeito. Só roda quando alguma sessão saiu desde a última volta.
      if (sessions.takeClosedCount() > 0) gc(true);
    }, SWEEP_INTERVAL_MS).unref();

    // Health check do Fly (fly.toml): responde antes de qualquer auth
    app.get("/health", (_req: Request, res: Response) => {
      const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
      res.json({
        status: "ok",
        sessions: sessions.size,
        memory: { rssMb: mb(process.memoryUsage().rss), heapMb: mb(heapStats().heapSize) },
      });
    });

    app.use((express as unknown as { json: (opts?: object) => RequestHandler }).json({
      limit: "10mb",
    }));

    app.use(oauthRouter);
    app.use("/mcp", validateApiKeyMiddleware);

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

      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId) {
        transport = sessions.get(sessionId);
        if (!transport) {
          unknownSession(res);
          return;
        }
        setSessionApiKey(sessionId, validatedApiKey);
      }

      const body = (req as Request & { body?: unknown }).body;
      if (!transport && !sessionId && body !== undefined && isInitializeRequest(body)) {
        await sessions.makeRoom();

        const keyForThisTransport = validatedApiKey;
        const server = createServer();
        const newTransport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.add(sid, newTransport, [newTransport, server]);
            setSessionApiKey(sid, keyForThisTransport);
          },
        });

        newTransport.onclose = () => {
          const sid = newTransport.sessionId;
          if (sid) sessions.forget(sid);
        };

        await server.connect(newTransport);
        transport = newTransport;
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

      const transport = sessions.get(sessionId);
      if (!transport) {
        unknownSession(res);
        return;
      }
      setSessionApiKey(sessionId, validatedApiKey);
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

    const shutdown = async () => {
      console.error("\n🛑 Encerrando servidor...");
      await sessions.closeAll();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Erro fatal em main():", error);
    process.exit(1);
  }
}

main();
