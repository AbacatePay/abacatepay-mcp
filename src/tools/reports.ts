import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";
import { apiKeyParam, buildQuery, toolError } from "./shared.js";

/**
 * Relatórios financeiros da Laura.
 *
 * Neste canal quem conduz a conversa é o modelo do cliente, então a garantia de que
 * o número está certo tem que viajar junto com o número. A API já devolve cada valor
 * escrito em português (`formattedTotals`, e as linhas como texto), e este módulo
 * apenas transcreve.
 *
 * **Nada aqui faz conta.** Não há divisão por 100, não há Intl.NumberFormat, não há
 * conversão de centavos. Se este arquivo voltar a formatar um número, passa a existir
 * uma segunda verdade sobre o que é "R$ 10,00" — e duas verdades sobre dinheiro é
 * exatamente o que o desenho da Laura existe para impedir.
 */

type Column = { key: string; label: string; type: string };

/** A forma que `/v2/reports/run` devolve — a mesma que o agente em processo entrega ao modelo. */
type ReportPayload = {
  reportId: string;
  title: string;
  period: { start: string; end: string; timezone: string };
  columns: Column[];
  /** Totais crus, para o modelo comparar grandezas. Não os exiba. */
  totals: Record<string, number>;
  /** Totais já escritos em português. É isto que aparece na resposta. */
  formattedTotals: Record<string, string>;
  /** Linhas já formatadas: todo valor é string pronta para leitura. */
  rows: Record<string, string>[];
  /** Linhas que a API cortou por serem muitas. */
  rowsOmitted: number;
  provenance: {
    sources: string[];
    documentsScanned: number;
    generatedAt: string;
    currency: string;
    devMode: boolean;
  };
  notes: string[];
};

/**
 * O rótulo de um total, quando existe coluna com a mesma chave.
 *
 * Vem do payload em vez de um mapa local: um mapa aqui envelheceria calado no dia em
 * que a API ganhasse um total novo.
 */
function totalLabel(columns: Column[], key: string): string {
  return columns.find((column) => column.key === key)?.label ?? key;
}

function renderReport(payload: ReportPayload): string {
  if (!payload.formattedTotals) {
    throw new Error(
      "A API devolveu o relatório sem `formattedTotals`. Esta ferramenta não formata números por conta própria — atualize a API (abkt-monorepo #1231) antes de usar."
    );
  }

  const lines: string[] = [];

  lines.push(`# ${payload.title}`);
  lines.push(
    `Período: ${payload.period.start} a ${payload.period.end} (${payload.period.timezone})`
  );
  if (payload.provenance.devMode) {
    lines.push("");
    lines.push(
      "**Conta em modo de testes — estes números não são da operação real.**"
    );
  }
  lines.push("");

  lines.push("## Totais");
  for (const [key, value] of Object.entries(payload.formattedTotals)) {
    lines.push(`- ${totalLabel(payload.columns, key)}: ${value}`);
  }
  lines.push("");

  if (payload.rows.length === 0) {
    lines.push("Sem movimento no período.");
  } else {
    lines.push("## Detalhamento");
    lines.push(`| ${payload.columns.map((column) => column.label).join(" | ")} |`);
    lines.push(`| ${payload.columns.map(() => "---").join(" | ")} |`);
    for (const row of payload.rows) {
      lines.push(`| ${payload.columns.map((column) => row[column.key] ?? "—").join(" | ")} |`);
    }
    if (payload.rowsOmitted > 0) {
      lines.push("");
      lines.push(
        `_${payload.rowsOmitted} linha(s) a mais não couberam. Os totais acima consideram o período inteiro; para ver o resto, peça um recorte menor._`
      );
    }
  }
  lines.push("");

  if (payload.notes.length > 0) {
    lines.push("## Como ler estes números");
    for (const note of payload.notes) lines.push(`- ${note}`);
    lines.push("");
  }

  lines.push(
    `_Fonte: ${payload.provenance.sources.join(", ")} · ${payload.provenance.documentsScanned} registro(s) · gerado em ${payload.provenance.generatedAt}_`
  );
  lines.push("");
  lines.push(
    "_Os valores acima já vêm calculados e escritos. Cite-os exatamente como estão: não refaça as contas, não converta centavos e não some colunas. Se a resposta precisar de um número que não está aqui, diga que não tem o recorte em vez de calcular._"
  );

  return lines.join("\n");
}

const PERIOD_PARAMS = {
  startDate: z.string().describe("Início do período, YYYY-MM-DD (inclusivo)."),
  endDate: z.string().describe("Fim do período, YYYY-MM-DD (inclusivo)."),
  timezone: z
    .string()
    .optional()
    .describe("Timezone IANA do recorte. Padrão: America/Sao_Paulo."),
};

/**
 * Um por relatório do registry da API (`modules/laura/reports` no abkt-monorepo).
 *
 * As descrições são as que o modelo lê para escolher a ferramenta, então falam a
 * língua de quem pergunta — "quanto paguei de taxa", não "fees_summary".
 */
const REPORTS: {
  name: string;
  reportId: string;
  description: string;
  period: boolean;
}[] = [
  {
    name: "getCashFlowReport",
    reportId: "cash_flow",
    description:
      "Fluxo de caixa por dia: entradas, saídas, taxas e resultado líquido no período. Use para 'quanto entrou e saiu', fechamento de mês e conferência de caixa. Segue exatamente a regra do extrato da conta.",
    period: true,
  },
  {
    name: "getRevenueByMethodReport",
    reportId: "revenue_by_method",
    description:
      "Receita bruta por método de pagamento (PIX, cartão, boleto), com número de transações, ticket médio e participação de cada método. Use para 'quanto vendi', 'qual método vende mais' e ticket médio.",
    period: true,
  },
  {
    name: "getFeesReport",
    reportId: "fees_summary",
    description:
      "Taxas pagas no período, quebradas por método, com taxa efetiva e valor líquido depois das taxas. Use para 'quanto paguei de taxa', conferência de tarifa e custo por método.",
    period: true,
  },
  {
    name: "getDisputesReport",
    reportId: "disputes_summary",
    description:
      "Disputas abertas no período por situação (em análise, ganhas, perdidas), com valor perdido e taxa de chargeback de cartão. Use para 'quantos chargebacks eu tive' e para acompanhar o limiar de 1%.",
    period: true,
  },
  {
    name: "getWithdrawalsReport",
    reportId: "withdrawals_summary",
    description:
      "Saques efetivados no período, por dia, com total, quantidade e valor médio. Use para 'quanto tirei da conta' e para conciliar com o extrato bancário da empresa.",
    period: true,
  },
  {
    name: "getReceivablesReport",
    reportId: "receivables_summary",
    description:
      "Valores a receber agora: recebíveis de cartão aprovados que ainda não liquidaram, com tempo de espera, comparados ao saldo pendente da conta. Não informa data prevista de liberação, porque a liquidação depende de confirmação do provedor.",
    period: false,
  },
  {
    name: "getBalanceReport",
    reportId: "balance_now",
    description:
      "Saldo atual da conta: disponível para saque, a receber, em antecipação e bloqueado, mais o débito de disputa. Use para 'quanto tenho na conta', 'quanto posso sacar' e 'por que meu saldo está retido'.",
    period: false,
  },
];

export function registerReportTools(server: McpServer) {
  for (const report of REPORTS) {
    server.tool(
      report.name,
      report.description,
      {
        apiKey: apiKeyParam(),
        ...(report.period ? PERIOD_PARAMS : {}),
      },
      async (params, extra) => {
        const p = params as any;
        try {
          const res = await makeAbacatePayRequest<{ data: ReportPayload }>({
            path: `/reports/run${buildQuery({
              reportId: report.reportId,
              startDate: p.startDate,
              endDate: p.endDate,
              timezone: p.timezone,
            })}`,
            apiKey: p.apiKey,
            sessionId: extra.sessionId,
            method: "GET",
          });
          return { content: [{ type: "text", text: renderReport(res.data) }] };
        } catch (e) {
          return toolError(e);
        }
      }
    );
  }
}
