import { closeLbug } from '../../mcp/core/lbug-adapter.js';
import { LocalBackend } from '../../mcp/local/local-backend.js';

export interface AgentContextToolRunner {
  query: (params: Record<string, unknown>) => Promise<any>;
  context: (params: Record<string, unknown>) => Promise<any>;
  impact: (params: Record<string, unknown>) => Promise<any>;
  cypher: (params: Record<string, unknown>) => Promise<any>;
  close: () => Promise<void>;
}

export async function createAgentContextToolRunner(): Promise<AgentContextToolRunner> {
  const backend = new LocalBackend();
  const ok = await backend.init();
  if (!ok) {
    throw new Error('No indexed repositories found. Run analyze first.');
  }

  return {
    query: (params: any) => backend.callTool('query', params),
    context: (params: any) => backend.callTool('context', params),
    impact: (params: any) => backend.callTool('impact', params),
    cypher: (params: any) => backend.callTool('cypher', params),
    close: async () => {
      await closeLbug();
    },
  };
}
