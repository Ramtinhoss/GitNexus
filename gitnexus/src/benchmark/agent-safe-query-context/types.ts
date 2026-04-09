import type { AgentContextToolStep } from '../agent-context/types.js';

export const AGENT_SAFE_CASE_KEYS = ['weapon_powerup', 'reload'] as const;
export type AgentSafeCaseKey = (typeof AGENT_SAFE_CASE_KEYS)[number];

export const AGENT_SAFE_TRACK_KEYS = [
  'workflow_replay_full',
  'workflow_replay_slim',
  'same_script_full',
  'same_script_slim',
  'subagent_live',
] as const;
export type AgentSafeTrackKey = (typeof AGENT_SAFE_TRACK_KEYS)[number];

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
  cases: Record<AgentSafeCaseKey, AgentSafeBenchmarkCase>;
}
