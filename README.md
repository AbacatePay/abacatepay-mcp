# 🥑 Abacate Pay MCP Server

Um servidor MCP (Model Context Protocol) para integração com a API do Abacate Pay, permitindo gerenciar pagamentos, clientes e cobranças diretamente através de assistentes de IA como Claude e Cursor.

## ✨ Multi-Tenancy

**🔐 Multi-tenancy ativo!** O servidor suporta múltiplos clientes simultaneamente. Cada requisição pode incluir sua própria chave de API, permitindo que diferentes usuários/organizações usem o mesmo servidor MCP com suas respectivas contas do Abacate Pay.

## O que você pode fazer

- 👥 **Gerenciar clientes**: Criar e listar clientes
- 💰 **Criar cobranças**: Links de pagamento e faturas  
- 📱 **QR Codes PIX**: Pagamentos instantâneos
- 🎫 **Cupons de desconto**: Promoções e descontos
- 🔄 **Simular pagamentos**: Testar fluxos em desenvolvimento

## 🚀 Instalação e Configuração

### 1. Clone o repositório

```bash
git clone https://github.com/AbacatePay/abacatepay-mcp.git
cd abacatepay-mcp
bun install
```

**📋 Pré-requisitos:**
- [Bun](https://bun.sh) instalado (versão 1.0.0 ou superior)

### 2. Configure no Claude Desktop

**Modo Multi-Tenant (Recomendado):**
```json
{
  "mcpServers": {
    "abacate-pay": {
      "command": "bun",
      "args": ["/caminho/completo/para/abacatepay-mcp/src/index.ts"]
    }
  }
}
```

**Modo Legacy (Compatibilidade):**
```json
{
  "mcpServers": {
    "abacate-pay": {
      "command": "bun",
      "args": ["/caminho/completo/para/abacatepay-mcp/src/index.ts"],
      "env": {
        "ABACATE_PAY_API_KEY": "sua_api_key_aqui"
      }
    }
  }
}
```

### 3. Configure no Cursor

**Modo Multi-Tenant (Recomendado):**
```json
{
  "mcp.servers": {
    "abacate-pay": {
      "command": "bun",
      "args": ["/caminho/completo/para/abacatepay-mcp/src/index.ts"]
    }
  }
}
```

**Modo Legacy (Compatibilidade):**
```json
{
  "mcp.servers": {
    "abacate-pay": {
      "command": "bun",
      "args": ["/caminho/completo/para/abacatepay-mcp/src/index.ts"],
      "env": {
        "ABACATE_PAY_API_KEY": "sua_api_key_aqui"
      }
    }
  }
}
```

**⚠️ Importante**: 
- Substitua `/caminho/completo/para/abacatepay-mcp/` pelo caminho real onde você clonou o repositório
- **Modo Multi-Tenant**: Não configure API key globalmente - ela será fornecida em cada requisição
- **Modo Legacy**: Configure a API key globalmente para compatibilidade com versões anteriores

## 🔑 Como obter sua API Key

1. Acesse [Abacate Pay](https://www.abacatepay.com)
2. Vá em **Integrar** → **API Keys**
3. Copie sua API Key

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

## 🔐 Como Funciona

### Modo Multi-Tenant (Recomendado)

Cada ferramenta aceita um parâmetro `apiKey` opcional:

**Criar Cliente:**
```json
{
  "apiKey": "sua_chave_api_aqui",
  "name": "João Silva",
  "cellphone": "(11) 99999-9999",
  "email": "joao@exemplo.com",
  "taxId": "123.456.789-01"
}
```

**Listar Clientes:**
```json
{
  "apiKey": "sua_chave_api_aqui"
}
```

### Modo Legacy (Compatibilidade)

No modo legacy, as ferramentas funcionam sem o parâmetro `apiKey`:

**Criar Cliente:**
```json
{
  "name": "João Silva",
  "cellphone": "(11) 99999-9999",
  "email": "joao@exemplo.com",
  "taxId": "123.456.789-01"
}
```

### Vantagens

✅ **Múltiplos usuários**: Diferentes pessoas podem usar o mesmo servidor MCP  
✅ **Isolamento de dados**: Cada API key acessa apenas seus próprios dados  
✅ **Flexibilidade**: Pode usar com ou sem API key global  
✅ **Segurança**: Credenciais não ficam armazenadas no servidor (modo multi-tenant)  
✅ **Escalabilidade**: Fácil de compartilhar entre equipes  
✅ **Compatibilidade**: Funciona com configurações existentes  

## 🌐 Uso Remoto e Automação

### HTTP Server para Automação

Para usar com ferramentas como n8n, Zapier, ou aplicações customizadas:

```bash
# Start HTTP server
bun run start:http

# Ou com porta customizada
MCP_PORT=8080 bun run start:http
```

### Exemplo de Integração

**HTTP Request (n8n/Zapier):**
```json
POST https://your-server.com/mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "createPixQrCode",
    "arguments": {
      "apiKey": "user_specific_key",
      "amount": 1000,
      "description": "Pagamento via automação"
    }
  }
}
```

**JavaScript/Node.js:**
```javascript
async function createCustomer(apiKey, customerData) {
  const response = await fetch('https://your-mcp-server.com/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'createCustomer',
        arguments: { apiKey, ...customerData }
      }
    })
  });
  return response.json();
}
```

## 🐛 Problemas Comuns

### Erro de API Key
```
❌ Falha ao criar cliente: HTTP 401: Unauthorized
```
**Solução**: 
- **Modo Multi-Tenant**: Verifique se sua API Key está correta e foi fornecida no parâmetro `apiKey`
- **Modo Legacy**: Verifique se sua API Key está correta na configuração global

### MCP Server não conecta
**Solução**: 
1. Verifique se o caminho para o arquivo está correto
2. Reinicie o Claude Desktop/Cursor após adicionar a configuração
3. Certifique-se de que o Bun está instalado e funcionando

### Erro de permissão
**Solução**: Certifique-se de que o Bun está instalado corretamente:
```bash
# Verificar instalação do Bun
bun --version

# Se necessário, instalar o Bun
curl -fsSL https://bun.sh/install | bash
```

## 🤝 Contribuição

Quer contribuir? Veja o [Guia de Contribuição](CONTRIBUTING.md).

## 📄 Licença

MIT - veja [LICENSE](LICENSE) para detalhes.

---



