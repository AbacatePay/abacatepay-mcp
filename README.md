# 🥑 Abacate Pay MCP Server

Um servidor MCP (Model Context Protocol) para integração com a API do Abacate Pay rodando no Cloudflare Workers, permitindo gerenciar pagamentos, clientes e cobranças diretamente através de assistentes de IA como Claude e Cursor.

## ✨ Multi-Tenancy

**🔐 Multi-tenancy ativo!** O servidor suporta múltiplos clientes simultaneamente. Cada requisição pode incluir sua própria chave de API, permitindo que diferentes usuários/organizações usem o mesmo servidor MCP com suas respectivas contas do Abacate Pay.

## 🚀 Deploy Rápido

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AbacatePay/abacatepay-mcp)

Ou clone e faça deploy manual:
```bash
git clone https://github.com/AbacatePay/abacatepay-mcp.git
cd abacatepay-mcp
npm install
npx wrangler deploy
```

## 🎯 O que você pode fazer

- 👥 **Gerenciar clientes**: Criar e listar clientes
- 💰 **Criar cobranças**: Links de pagamento e faturas  
- 📱 **QR Codes PIX**: Pagamentos instantâneos
- 🎫 **Cupons de desconto**: Promoções e descontos
- 🔄 **Simular pagamentos**: Testar fluxos em desenvolvimento

## 🔑 Como obter sua API Key

1. Acesse [Abacate Pay](https://www.abacatepay.com)
2. Vá em **Integrar** → **API Keys**
3. Copie sua API Key (formato: `abc_dev_...` ou `abc_live_...`)

## ⚙️ Configuração no Cursor/Claude

### Opção 1: Multi-Tenant (Recomendado)

Cada usuário configura sua própria chave:

```json
{
  "mcpServers": {
    "abacate-pay": {
      "type": "http",
      "url": "https://abacatepay-mcp.SEU_USUARIO.workers.dev/mcp?key=SUA_CHAVE_AQUI",
      "sseUrl": "https://abacatepay-mcp.SEU_USUARIO.workers.dev/sse?key=SUA_CHAVE_AQUI"
    }
  }
}
```

### Opção 2: Desenvolvimento Local

```json
{
  "mcpServers": {
    "abacate-pay": {
      "type": "http",
      "url": "http://localhost:8787/mcp?key=SUA_CHAVE_AQUI",
      "sseUrl": "http://localhost:8787/sse?key=SUA_CHAVE_AQUI"
    }
  }
}
```

**⚠️ Importante**: 
- Substitua `SEU_USUARIO` pelo seu username do Cloudflare
- Substitua `SUA_CHAVE_AQUI` pela sua API key do Abacate Pay
- O servidor aceita chaves via query string `?key=` ou header `x-abacatepay-key`

## 🏗️ Desenvolvimento Local

```bash
# Clone o repositório
git clone https://github.com/AbacatePay/abacatepay-mcp.git
cd abacatepay-mcp

# Instale dependências
npm install

# Execute localmente
npm start

# Teste endpoints
curl "http://localhost:8787/sse?key=SUA_CHAVE"
curl "http://localhost:8787/mcp?key=SUA_CHAVE"
```

## 📝 Exemplos de Uso

### 🎯 Campanha com Influencer
```
"Eu contratei um influencer chamado Alex para divulgar meu negócio. Você pode criar um cupom com 15% de desconto usando o código ALEX15 que vale para até 100 usos? Preciso acompanhar o desempenho da campanha."
```

### 🔍 Investigação de Cobranças
```
"Tive uma cobrança estranha ontem que não reconheço. Você pode buscar todas as cobranças de ontem e me mostrar os detalhes para eu verificar o que pode ter acontecido?"
```

### 💼 Novo Cliente Corporativo  
```
"Acabei de fechar um contrato com a empresa TechSolutions LTDA (CNPJ: 12.345.678/0001-90). Pode criar o cadastro deles com o email contato@techsolutions.com e telefone (11) 3456-7890? Depois preciso gerar um QR Code PIX de R$ 10 para o pagamento."
```

## 🔐 Segurança e Multi-Tenancy

### ✅ Recursos de Segurança

- **🛡️ Rate Limiting**: 100 requisições por minuto por IP+chave
- **🔒 Error Sanitization**: Erros não vazam informações sensíveis
- **🌐 CORS**: Suporte adequado para browsers
- **👥 Isolamento**: Cada chave acessa apenas seus próprios dados
- **⚡ Workers**: Execução distribuída e escalável

### 🔑 Como Funciona

**Multi-Tenant**: Cada tool aceita parâmetro `apiKey` opcional
```json
{
  "name": "createCustomer",
  "arguments": {
    "apiKey": "abc_dev_sua_chave_aqui",
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "cellphone": "(11) 99999-9999",
    "taxId": "123.456.789-01"
  }
}
```

**Prioridade de Chaves**:
1. Header `x-abacatepay-key`
2. Query string `?key=`
3. Parâmetro `apiKey` na tool

## 🌐 Integração com Automação

### HTTP API para n8n/Zapier

```javascript
// Exemplo para criar cliente via HTTP
const response = await fetch('https://SEU_WORKER.workers.dev/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-abacatepay-key': 'SUA_CHAVE_AQUI'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'createCustomer',
      arguments: {
        name: 'João Silva',
        email: 'joao@exemplo.com',
        cellphone: '(11) 99999-9999',
        taxId: '123.456.789-01'
      }
    }
  })
});
```

## 🐛 Problemas Comuns

### ❌ Erro 401 - Chave inválida
```
❌ Chave de API inválida. Verifique suas credenciais.
```
**Solução**: Verifique se a chave está correta e é válida no Abacate Pay.

### ❌ Erro 429 - Rate limit
```
❌ Rate limit exceeded
```
**Solução**: Aguarde 1 minuto antes de fazer novas requisições.

### ❌ MCP não conecta
**Solução**: 
1. Verifique se a URL está correta
2. Teste com curl primeiro
3. Reinicie o Claude/Cursor após configurar

## 🤝 Contribuição

Quer contribuir? Abra issues e PRs no [GitHub](https://github.com/AbacatePay/abacatepay-mcp)!

## 📄 Licença

MIT - veja [LICENSE](LICENSE) para detalhes.

---

**🥑 Feito com ❤️ pela equipe [Abacate Pay](https://www.abacatepay.com)** 
