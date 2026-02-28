export interface Thresholds {
  query: { precisionMin: number; recallMin: number };
  contextImpact: { f1Min: number };
  smoke: { passRateMin: number };
  performance: { analyzeTimeRegressionMaxPct: number };
}

export interface SymbolCase {
  symbol_uid: string;
  file_path: string;
  symbol_name: string;
  symbol_type: string;
  start_line: number;
  end_line: number;
}

export interface RelationCase {
  src_uid: string;
  edge_type: string;
  dst_uid: string;
  must_exist: boolean;
}

export interface TaskCase {
  tool: 'query' | 'context' | 'impact';
  input: Record<string, unknown>;
  must_hit_uids: string[];
  must_not_hit_uids: string[];
  min_result_count?: number;
}
