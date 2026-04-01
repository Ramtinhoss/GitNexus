export type RuntimeChainEvidenceLevel = 'none' | 'clue' | 'verified_segment' | 'verified_chain';

export interface DeriveRuntimeChainEvidenceLevelInput {
  mode: 'none' | 'heuristic_clue' | 'verified_hops';
  requiredSegments?: string[];
  foundSegments?: string[];
}

export function deriveRuntimeChainEvidenceLevel(
  input: DeriveRuntimeChainEvidenceLevelInput,
): RuntimeChainEvidenceLevel {
  if (input.mode === 'none') return 'none';
  if (input.mode === 'heuristic_clue') return 'clue';

  const required = new Set((input.requiredSegments || []).map((segment) => String(segment).trim()).filter(Boolean));
  const found = new Set((input.foundSegments || []).map((segment) => String(segment).trim()).filter(Boolean));
  const missingRequired = [...required].filter((segment) => !found.has(segment));

  if (required.size > 0 && missingRequired.length === 0) {
    return required.has('code_runtime') ? 'verified_chain' : 'verified_segment';
  }

  return found.size > 0 ? 'verified_segment' : 'none';
}
