import { describe, expect, test } from "bun:test";
import { getSessionApiKey, setSessionApiKey } from "../../src/context.js";
import { createSessionStore } from "../../src/http/sessions.js";

function fakePart() {
  const part = { closed: 0, close: () => void part.closed++ };
  return part;
}

function setup(options: { idleTtlMs?: number; maxSessions?: number } = {}) {
  let clock = 0;
  const store = createSessionStore<ReturnType<typeof fakePart>>({
    idleTtlMs: options.idleTtlMs ?? 1000,
    maxSessions: options.maxSessions ?? 10,
    now: () => clock,
  });
  const open = (id: string) => {
    const transport = fakePart();
    const server = fakePart();
    store.add(id, transport, [transport, server]);
    setSessionApiKey(id, `key-${id}`);
    return { transport, server };
  };
  return { store, open, tick: (ms: number) => (clock += ms) };
}

describe("sessões do /mcp", () => {
  test("varredura fecha sessão parada além do TTL e libera a chave", async () => {
    const { store, open, tick } = setup({ idleTtlMs: 1000 });
    const idle = open("parada");
    open("ativa");
    tick(600);
    store.get("ativa");
    tick(600);

    expect(await store.sweep()).toBe(1);
    expect(store.size).toBe(1);
    expect(store.get("parada")).toBeUndefined();
    expect(store.get("ativa")).toBeDefined();
    expect(idle.transport.closed).toBe(1);
    expect(idle.server.closed).toBe(1);
    expect(getSessionApiKey("parada")).toBeUndefined();
    expect(getSessionApiKey("ativa")).toBe("key-ativa");
    expect(store.takeClosedCount()).toBe(1);
    expect(store.takeClosedCount()).toBe(0);
  });

  test("no teto, abrir uma nova fecha a que está parada há mais tempo", async () => {
    const { store, open, tick } = setup({ maxSessions: 2 });
    const a = open("a");
    tick(10);
    open("b");
    tick(10);
    store.get("a"); // a foi usada por último; b é a mais parada

    await store.makeRoom();
    open("c");

    expect(store.size).toBe(2);
    expect(store.get("b")).toBeUndefined();
    expect(store.get("a")).toBeDefined();
    expect(store.get("c")).toBeDefined();
    expect(a.transport.closed).toBe(0);
    expect(store.takeClosedCount()).toBe(1);
  });

  test("forget (onclose do transport) só tira do mapa, sem fechar de novo", () => {
    const { store, open } = setup();
    const s = open("x");
    store.forget("x");
    expect(store.size).toBe(0);
    expect(s.transport.closed).toBe(0);
    expect(getSessionApiKey("x")).toBeUndefined();
  });

  test("fechar uma parte que já fechou não derruba a varredura", async () => {
    const { store, tick } = setup({ idleTtlMs: 1 });
    const broken = { close: () => Promise.reject(new Error("já fechado")) };
    const ok = fakePart();
    store.add("quebrada", ok, [broken, ok]);
    tick(5);
    expect(await store.sweep()).toBe(1);
    expect(ok.closed).toBe(1);
  });

  test("closeAll fecha tudo no desligamento", async () => {
    const { store, open } = setup();
    const a = open("a");
    const b = open("b");
    await store.closeAll();
    expect(store.size).toBe(0);
    expect(a.server.closed + b.server.closed).toBe(2);
  });
});
