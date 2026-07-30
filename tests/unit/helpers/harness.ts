export type ToolHandler = (
  params: Record<string, unknown>,
  extra: { sessionId?: string; signal?: AbortSignal; authInfo?: unknown }
) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

export type CollectedTool = {
  description: string;
  schema: Record<string, unknown>;
  handler: ToolHandler;
};

/** Roda uma função registerXxxTools contra um McpServer falso e devolve um Map nome→tool. */
export function collectTools(
  register: (server: { tool: (...args: any[]) => void }) => void
): Map<string, CollectedTool> {
  const tools = new Map<string, CollectedTool>();
  const fakeServer = {
    tool(name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler) {
      tools.set(name, { description, schema, handler });
    },
  };
  register(fakeServer);
  return tools;
}
