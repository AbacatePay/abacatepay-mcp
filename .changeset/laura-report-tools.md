---
"abacatepay-mcp": minor
---

Expõe os sete relatórios financeiros da Laura como ferramentas, para o time financeiro do lojista perguntar em português.

- `getCashFlowReport`, `getRevenueByMethodReport`, `getFeesReport`, `getDisputesReport` e `getWithdrawalsReport` recebem período (`startDate`, `endDate`, `timezone` opcional); `getReceivablesReport` e `getBalanceReport` são fotos do momento.
- O render transcreve os valores que a API já devolve escritos (`formattedTotals`, e as linhas como texto) e não faz nenhuma conta — sem divisão por 100, sem `Intl.NumberFormat`, sem conversão de centavos. Formatar aqui criaria uma segunda verdade sobre o que é "R$ 10,00".
- Payload sem `formattedTotals` vira erro explícito em vez de fallback silencioso.
- Junto com os números viajam as ressalvas do relatório, o aviso de conta em modo de testes, a proveniência e a contagem de linhas cortadas quando a API trunca.
- `ABACATE_PAY_API_BASE` aceita sobrescrita por variável de ambiente, para apontar o servidor a uma API local. Sem a variável, produção.
