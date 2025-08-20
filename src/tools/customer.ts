import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeAbacatePayRequest } from "../http/api.js";

export function registerCustomerTools(server: McpServer) {
  server.tool(
    "createCustomer",
    "Cria um novo cliente no Abacate Pay",
    {
      apiKey: z.string().optional().describe("Chave de API do Abacate Pay (opcional se configurada globalmente)"),
      name: z.string().describe("Nome completo do cliente"),
      cellphone: z.string().describe("Celular do cliente (ex: (11) 4002-8922)"),
      email: z.string().email().describe("E-mail do cliente"),
      taxId: z.string().describe("CPF ou CNPJ válido do cliente (ex: 123.456.789-01)")
    },
    async (params) => {
      const { apiKey, name, cellphone, email, taxId } = params as any;
      try {
        const response = await makeAbacatePayRequest<any>("/customer/create", apiKey, {
          method: "POST",
          body: JSON.stringify({
            name,
            cellphone,
            email,
            taxId
          })
        });

        return {
          content: [
            {
              type: "text",
              text: `Cliente criado com sucesso!\nID: ${response.data?.id || 'N/A'}\nNome: ${name}\nEmail: ${email}\nCelular: ${cellphone}\nCPF/CNPJ: ${taxId}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao criar cliente: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    "listCustomers",
    "Lista todos os clientes cadastrados no Abacate Pay",
    {
      apiKey: z.string().optional().describe("Chave de API do Abacate Pay (opcional se configurada globalmente)")
    },
    async (params) => {
      const { apiKey } = params as any;
      try {
        const response = await makeAbacatePayRequest<any>("/customer/list", apiKey, {
          method: "GET"
        });

        if (!response.data || response.data.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Nenhum cliente encontrado."
              }
            ]
          };
        }

        const customersList = response.data.map((customer: any, index: number) => {
          const metadata = customer.metadata || {};
          return `${index + 1}. ID: ${customer.id}
     Nome: ${metadata.name || 'N/A'}
     Email: ${metadata.email || 'N/A'}
     Celular: ${metadata.cellphone || 'N/A'}
     CPF/CNPJ: ${metadata.taxId || 'N/A'}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: "text",
              text: `Lista de Clientes (${response.data.length} encontrado(s)):\n\n${customersList}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Falha ao listar clientes: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            }
          ]
        };
      }
    }
  );
} 