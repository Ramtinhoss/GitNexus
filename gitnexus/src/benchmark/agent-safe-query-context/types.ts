import type { AgentContextToolStep } from '../agent-context/types.js';

export interface SemanticTuple {
  resource_anchor: string;
  symbol_anchor: string;
  proof_edge?: string;
  proof_edges?: string[];
  closure_status: 'not_verified_full' | 'verified_partial' | 'verified_full' | 'failed';
}

export interface AgentSafeLiveTask {
  objective: string;
  symbol_seed: string;
  resource_seed: string;
}

export interface AgentSafeBenchmarkCase {
  label: string;
  start_query: string;
  retry_query: string;
  start_query_input?: Record<string, unknown>;
  retry_query_input?: Record<string, unknown>;
  proof_contexts: string[];
  proof_cypher: string;
  tool_plan: AgentContextToolStep[];
  live_task: AgentSafeLiveTask;
  semantic_tuple: SemanticTuple;
}

export interface AgentSafeBenchmarkThresholds {
  workflowReplay: {
    maxSteps: number;
  };
  tokenReduction: {
    weapon_powerup: number;
    reload: number;
  };
}

export interface AgentSafeBenchmarkSuite {
  thresholds: AgentSafeBenchmarkThresholds;
  cases: {
    weapon_powerup: AgentSafeBenchmarkCase;
    reload: AgentSafeBenchmarkCase;
  };
}
