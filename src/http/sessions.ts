import { clearSessionApiKey } from "../context.js";

/**
 * Sessões do Streamable HTTP, em memória. Cada uma segura um transport e um McpServer com todas
 * as tools registradas (~1 MB), e o cliente quase nunca manda DELETE: Claude.ai, ChatGPT e
 * automações abrem a sessão e somem. Sem expirar, o Map só cresce até a máquina de 512 MB parar
 * de atender — foi o que derrubou o mcp.abacatepay.com três dias depois do deploy de 13/10.
 *
 * Duas travas:
 * - sessão parada há mais de `idleTtlMs` é fechada na varredura;
 * - acima de `maxSessions`, abrir uma nova fecha a que está parada há mais tempo.
 *
 * Fechar uma sessão que o cliente ainda queria é seguro: o próximo request dele recebe 404 e
 * ele abre outra sozinho (ver unknownSession em http-server.ts).
 */

export interface ClosableSession {
  close(): Promise<void> | void;
}

interface Entry {
  parts: ClosableSession[];
  lastSeen: number;
}

export interface SessionStoreOptions {
  idleTtlMs: number;
  maxSessions: number;
  now?: () => number;
}

export function createSessionStore<T extends ClosableSession>(options: SessionStoreOptions) {
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry & { transport: T }>();
  let closedSinceLastCheck = 0;

  async function close(sessionId: string): Promise<void> {
    const entry = entries.get(sessionId);
    if (!entry) return;
    entries.delete(sessionId);
    clearSessionApiKey(sessionId);
    closedSinceLastCheck++;
    for (const part of entry.parts) {
      try {
        await part.close();
      } catch {
        // transport/servidor já fechado: nada a liberar
      }
    }
  }

  function oldest(): string | undefined {
    let found: string | undefined;
    let at = Number.POSITIVE_INFINITY;
    for (const [id, entry] of entries) {
      if (entry.lastSeen < at) {
        at = entry.lastSeen;
        found = id;
      }
    }
    return found;
  }

  return {
    /** Abre espaço pra uma sessão nova: fecha a mais parada se o teto foi atingido */
    async makeRoom(): Promise<void> {
      while (entries.size >= options.maxSessions) {
        const id = oldest();
        if (!id) return;
        await close(id);
      }
    },

    /** `parts`: o que fechar junto com a sessão (o transport e o McpServer dela) */
    add(sessionId: string, transport: T, parts: ClosableSession[]): void {
      entries.set(sessionId, { transport, parts, lastSeen: now() });
    },

    /** Devolve o transport e marca a sessão como ativa agora */
    get(sessionId: string): T | undefined {
      const entry = entries.get(sessionId);
      if (!entry) return undefined;
      entry.lastSeen = now();
      return entry.transport;
    },

    /** Chamado no onclose do transport (DELETE do cliente ou conexão encerrada) */
    forget(sessionId: string): void {
      entries.delete(sessionId);
      clearSessionApiKey(sessionId);
    },

    close,

    /** Fecha as sessões paradas há mais de idleTtlMs; devolve quantas fechou */
    async sweep(): Promise<number> {
      const limit = now() - options.idleTtlMs;
      const idle = [...entries].filter(([, entry]) => entry.lastSeen < limit).map(([id]) => id);
      for (const id of idle) await close(id);
      return idle.length;
    },

    /** Quantas sessões foram fechadas (por expiração ou teto) desde a última chamada */
    takeClosedCount(): number {
      const count = closedSinceLastCheck;
      closedSinceLastCheck = 0;
      return count;
    },

    get size(): number {
      return entries.size;
    },

    async closeAll(): Promise<void> {
      for (const id of [...entries.keys()]) await close(id);
    },
  };
}
