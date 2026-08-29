import { afterEach, describe, expect, test } from "bun:test";
import { collectTools } from "./helpers/harness.js";
import { restoreFetch, stubFetch } from "./helpers/fetch-stub.js";
import { registerReportTools } from "../../src/tools/reports.js";

const KEY = "abc_test_secret_123";
afterEach(() => restoreFetch());

/**
 * A resposta de `/v2/reports/run` já vem escrita: `formattedTotals` e linhas em texto.
 * Estes testes existem para travar que o MCP transcreve — se alguém reintroduzir
 * formatação aqui, "R$ 10,00" vira outra coisa e nada mais avisa.
 */
const CASH_FLOW = {
  data: {
    reportId: "cash_flow",
    title: "Fluxo de caixa",
    period: { start: "2026-07-01", end: "2026-07-31", timezone: "America/Sao_Paulo" },
    columns: [
      { key: "day", label: "Dia", type: "date" },
      { key: "inflow", label: "Entradas", type: "money" },
      { key: "fees", label: "Taxas (parte das saídas)", type: "money" },
    ],
    totals: { inflow: 1000, fees: 95 },
    formattedTotals: { inflow: "R$ 10,00", fees: "R$ 0,95" },
    rows: [{ day: "2026-07-06", inflow: "R$ 10,00", fees: "R$ 0,95" }],
    rowsOmitted: 0,
    provenance: {
      sources: ["transaction"],
      documentsScanned: 1,
      generatedAt: "2026-08-29T17:39:14.827Z",
      currency: "BRL",
      devMode: false,
    },
    notes: ["Recebíveis de cartão ainda não liquidados não entram como entrada."],
  },
};

describe("registerReportTools", () => {
  test("registra uma ferramenta por relatório do registry", () => {
    const tools = collectTools(registerReportTools);
    expect([...tools.keys()].sort()).toEqual([
      "getBalanceReport",
      "getCashFlowReport",
      "getDisputesReport",
      "getFeesReport",
      "getReceivablesReport",
      "getRevenueByMethodReport",
      "getWithdrawalsReport",
    ]);
  });

  test("GET /reports/run com reportId e período", async () => {
    const tools = collectTools(registerReportTools);
    const calls = stubFetch(CASH_FLOW);

    await tools.get("getCashFlowReport")!.handler(
      { apiKey: KEY, startDate: "2026-07-01", endDate: "2026-07-31" },
      {}
    );

    expect(calls[0].url).toBe(
      "https://api.abacatepay.com/v2/reports/run?reportId=cash_flow&startDate=2026-07-01&endDate=2026-07-31"
    );
    expect(calls[0].init.method).toBe("GET");
  });

  test("relatório sem período não manda startDate nem endDate", async () => {
    const tools = collectTools(registerReportTools);
    const calls = stubFetch({ ...CASH_FLOW, data: { ...CASH_FLOW.data, reportId: "balance_now" } });

    await tools.get("getBalanceReport")!.handler({ apiKey: KEY }, {});

    expect(calls[0].url).toBe("https://api.abacatepay.com/v2/reports/run?reportId=balance_now");
  });

  test("transcreve os valores escritos da API, sem recalcular", async () => {
    const tools = collectTools(registerReportTools);
    stubFetch(CASH_FLOW);

    const out = await tools.get("getCashFlowReport")!.handler(
      { apiKey: KEY, startDate: "2026-07-01", endDate: "2026-07-31" },
      {}
    );
    const text = out.content[0].text;

    // O valor escrito aparece; o inteiro cru em centavos, não.
    expect(text).toContain("R$ 10,00");
    expect(text).toContain("R$ 0,95");
    expect(text).not.toContain("1000");
    // Rótulo vem da coluna de mesma chave, não de um mapa local.
    expect(text).toContain("- Entradas: R$ 10,00");
    // As ressalvas viajam junto com o número.
    expect(text).toContain("Recebíveis de cartão ainda não liquidados não entram como entrada.");
  });

  test("avisa quando a conta está em modo de testes", async () => {
    const tools = collectTools(registerReportTools);
    stubFetch({
      data: { ...CASH_FLOW.data, provenance: { ...CASH_FLOW.data.provenance, devMode: true } },
    });

    const out = await tools.get("getCashFlowReport")!.handler(
      { apiKey: KEY, startDate: "2026-07-01", endDate: "2026-07-31" },
      {}
    );

    expect(out.content[0].text).toContain("modo de testes");
  });

  test("diz quantas linhas ficaram de fora em vez de omitir calado", async () => {
    const tools = collectTools(registerReportTools);
    stubFetch({ data: { ...CASH_FLOW.data, rowsOmitted: 50 } });

    const out = await tools.get("getCashFlowReport")!.handler(
      { apiKey: KEY, startDate: "2026-07-01", endDate: "2026-09-30" },
      {}
    );

    expect(out.content[0].text).toContain("50 linha(s) a mais não couberam");
  });

  test("período sem movimento não vira tabela vazia", async () => {
    const tools = collectTools(registerReportTools);
    stubFetch({
      data: { ...CASH_FLOW.data, rows: [], totals: {}, formattedTotals: {} },
    });

    const out = await tools.get("getCashFlowReport")!.handler(
      { apiKey: KEY, startDate: "2026-07-01", endDate: "2026-07-31" },
      {}
    );

    expect(out.content[0].text).toContain("Sem movimento no período.");
  });

  test("recusa payload sem formattedTotals em vez de formatar por conta própria", async () => {
    const tools = collectTools(registerReportTools);
    const { formattedTotals, ...semFormatados } = CASH_FLOW.data;
    stubFetch({ data: semFormatados });

    const out = await tools.get("getCashFlowReport")!.handler(
      { apiKey: KEY, startDate: "2026-07-01", endDate: "2026-07-31" },
      {}
    );

    expect(out.content[0].text).toContain("sem `formattedTotals`");
  });

  test("devolve o erro da API como texto, sem derrubar a conversa", async () => {
    const tools = collectTools(registerReportTools);
    stubFetch({ error: "Relatório desconhecido: xpto" }, 400);

    const out = await tools.get("getCashFlowReport")!.handler(
      { apiKey: KEY, startDate: "2026-07-01", endDate: "2026-07-31" },
      {}
    );

    expect(out.content[0].text).toContain("Relatório desconhecido");
  });
});
