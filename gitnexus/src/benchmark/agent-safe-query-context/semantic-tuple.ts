import type { SemanticTuple } from './types.js';

export type LiveFailureClass = 'semantic_drift' | 'evidence_missing' | 'expression_mismatch' | 'over_investigated';

export interface LiveTupleScore {
  normalized_tuple: SemanticTuple;
  normalized_tuple_pass: boolean;
  evidence_validation_pass: boolean;
  failure_class?: LiveFailureClass;
}

export function semanticTuplePass(actual: SemanticTuple, expected: SemanticTuple): boolean {
  return JSON.stringify(normalizeTuple(actual)) === JSON.stringify(normalizeTuple(expected));
}

export function scoreLiveTuple(
  expected: SemanticTuple,
  finalResult: {
    resource_anchor?: unknown;
    symbol_anchor?: unknown;
    proof_edge?: unknown;
    proof_edges?: unknown;
    closure_status?: unknown;
  },
  outputs: unknown[],
  options: { toolCalls?: number; overInvestigatedThreshold?: number } = {},
): LiveTupleScore {
  const normalizedTuple = normalizeLiveTuple(expected, finalResult);
  const normalizedTuplePass = semanticTuplePass(normalizedTuple, expected);
  const evidenceTuple = deriveSemanticTuple(expected, outputs);
  const evidenceValidationPass = semanticTuplePass(evidenceTuple, expected);
  const failureClass = classifyLiveFailure(expected, normalizedTuple, normalizedTuplePass, evidenceValidationPass, options);

  return {
    normalized_tuple: normalizedTuple,
    normalized_tuple_pass: normalizedTuplePass,
    evidence_validation_pass: evidenceValidationPass,
    failure_class: failureClass,
  };
}

export function deriveSemanticTuple(expected: SemanticTuple, outputs: unknown[]): SemanticTuple {
  return {
    resource_anchor: hasExactString(outputs, expected.resource_anchor) ? expected.resource_anchor : '',
    symbol_anchor: hasExactString(outputs, expected.symbol_anchor) ? expected.symbol_anchor : '',
    proof_edge: expected.proof_edge && hasProofEdge(outputs, expected.proof_edge) ? expected.proof_edge : undefined,
    proof_edges: expected.proof_edges?.filter((edge) => hasProofEdge(outputs, edge)),
    closure_status: expected.closure_status,
  };
}

function normalizeLiveTuple(
  expected: SemanticTuple,
  finalResult: {
    resource_anchor?: unknown;
    symbol_anchor?: unknown;
    proof_edge?: unknown;
    proof_edges?: unknown;
    closure_status?: unknown;
  },
): SemanticTuple {
  const normalizedResourceAnchor = normalizeResourceAnchor(expected.resource_anchor, finalResult.resource_anchor);
  const normalizedSymbolAnchor = normalizeSymbolAnchor(expected.symbol_anchor, finalResult.symbol_anchor);
  const reportedEdges = collectReportedEdges(finalResult.proof_edge, finalResult.proof_edges);
  const normalizedProofEdge = expected.proof_edge && containsExpectedEdge(expected.proof_edge, reportedEdges)
    ? expected.proof_edge
    : undefined;
  const normalizedProofEdges = expected.proof_edges?.filter((edge) => containsExpectedEdge(edge, reportedEdges));
  const closureStatus = isClosureStatus(finalResult.closure_status) ? finalResult.closure_status : expected.closure_status;

  return {
    resource_anchor: normalizedResourceAnchor,
    symbol_anchor: normalizedSymbolAnchor,
    proof_edge: normalizedProofEdge,
    proof_edges: normalizedProofEdges,
    closure_status: closureStatus,
  };
}

function normalizeTuple(tuple: SemanticTuple): SemanticTuple {
  return {
    resource_anchor: tuple.resource_anchor,
    symbol_anchor: tuple.symbol_anchor,
    proof_edge: tuple.proof_edge,
    proof_edges: tuple.proof_edges ? [...tuple.proof_edges].sort() : undefined,
    closure_status: tuple.closure_status,
  };
}

function hasExactString(outputs: unknown[], expected: string): boolean {
  return outputs.some((output) => valueContainsString(output, expected));
}

function hasProofEdge(outputs: unknown[], edge: string): boolean {
  if (hasExactString(outputs, edge)) {
    return true;
  }

  const parsed = parseProofEdge(edge);
  if (!parsed) {
    return false;
  }

  return outputs.some((output) => valueContainsEdge(output, parsed.source, parsed.targetMethod));
}

function containsExpectedEdge(expectedEdge: string, reportedEdges: Array<{ source: string; targetMethod: string }>): boolean {
  const parsedExpected = parseProofEdge(expectedEdge);
  if (!parsedExpected) {
    return false;
  }
  return reportedEdges.some(
    (edge) => edge.source === parsedExpected.source && edge.targetMethod === parsedExpected.targetMethod,
  );
}

function normalizeResourceAnchor(expectedResource: string, candidate: unknown): string {
  if (typeof candidate !== 'string') {
    return '';
  }
  return candidate === expectedResource ? expectedResource : '';
}

function normalizeSymbolAnchor(expectedSymbol: string, candidate: unknown): string {
  if (typeof candidate !== 'string') {
    return '';
  }
  const normalizedCandidate = candidate.trim();
  if (normalizedCandidate === expectedSymbol || normalizedCandidate.endsWith(`.${expectedSymbol}`)) {
    return expectedSymbol;
  }
  return '';
}

function collectReportedEdges(
  proofEdge: unknown,
  proofEdges: unknown,
): Array<{ source: string; targetMethod: string }> {
  const collected: Array<{ source: string; targetMethod: string }> = [];
  collectEdgesRecursive(proofEdge, collected);
  collectEdgesRecursive(proofEdges, collected);
  return collected;
}

function collectEdgesRecursive(value: unknown, collected: Array<{ source: string; targetMethod: string }>): void {
  if (!value) {
    return;
  }
  if (typeof value === 'string') {
    const parsed = parseProofEdge(value);
    if (parsed) {
      collected.push(parsed);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectEdgesRecursive(entry, collected));
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const record = value as Record<string, unknown>;
  const pairs: Array<[unknown, unknown]> = [
    [record.src, record.dst],
    [record.source, record.target],
    [record.caller, record.callee],
    [record.from, record.to],
  ];
  for (const [left, right] of pairs) {
    const parsed = parseEdgeFromPair(left, right);
    if (parsed) {
      collected.push(parsed);
    }
  }
  Object.values(record).forEach((entry) => collectEdgesRecursive(entry, collected));
}

function parseEdgeFromPair(left: unknown, right: unknown): { source: string; targetMethod: string } | null {
  const source = extractName(left);
  const target = extractName(right);
  if (!source || !target) {
    return null;
  }
  const targetMethod = target.split('.').pop() || target;
  return { source, targetMethod };
}

function extractName(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.split('.').pop() || value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      extractName(record.name) ||
      extractName(record.id) ||
      extractName(record.uid) ||
      extractName(record.symbol) ||
      null
    );
  }
  return null;
}

function classifyLiveFailure(
  expected: SemanticTuple,
  normalizedTuple: SemanticTuple,
  normalizedTuplePass: boolean,
  evidenceValidationPass: boolean,
  options: { toolCalls?: number; overInvestigatedThreshold?: number },
): LiveFailureClass | undefined {
  if (normalizedTuplePass && evidenceValidationPass) {
    return undefined;
  }
  if (normalizedTuplePass && !evidenceValidationPass) {
    return 'evidence_missing';
  }

  const overInvestigatedThreshold = options.overInvestigatedThreshold ?? 6;
  if ((options.toolCalls ?? 0) > overInvestigatedThreshold) {
    return 'over_investigated';
  }

  const anchorDrift = normalizedTuple.resource_anchor !== expected.resource_anchor
    || normalizedTuple.symbol_anchor !== expected.symbol_anchor;
  return anchorDrift ? 'semantic_drift' : 'expression_mismatch';
}

function isClosureStatus(value: unknown): value is SemanticTuple['closure_status'] {
  return value === 'not_verified_full' || value === 'verified_partial' || value === 'verified_full' || value === 'failed';
}

function valueContainsString(value: unknown, expected: string): boolean {
  if (typeof value === 'string') {
    return value.includes(expected);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => valueContainsString(entry, expected));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => valueContainsString(entry, expected));
  }
  return false;
}

function valueContainsEdge(value: unknown, source: string, targetMethod: string): boolean {
  if (typeof value === 'string') {
    return (
      value.includes(`| ${source} | ${targetMethod} |`)
      || value.includes(`${source} -> ${targetMethod}`)
    );
  }
  if (Array.isArray(value)) {
    return value.some((entry) => valueContainsEdge(entry, source, targetMethod));
  }
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  const pairs: Array<[unknown, unknown]> = [
    [record.src, record.dst],
    [record.source, record.target],
    [record.caller, record.callee],
    [record.from, record.to],
  ];

  for (const [left, right] of pairs) {
    if (matchName(left, source) && matchName(right, targetMethod)) {
      return true;
    }
  }

  return Object.values(record).some((entry) => valueContainsEdge(entry, source, targetMethod));
}

function matchName(value: unknown, expected: string): boolean {
  if (typeof value === 'string') {
    return value === expected || value.endsWith(`.${expected}`);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      matchName(record.name, expected) ||
      matchName(record.id, expected) ||
      matchName(record.uid, expected)
    );
  }
  return false;
}

function parseProofEdge(edge: string): { source: string; targetMethod: string } | null {
  const [sourcePart, targetPart] = edge.split('->').map((part) => part.trim());
  if (!sourcePart || !targetPart) {
    return null;
  }

  const source = sourcePart.split('.').pop() || sourcePart;
  const targetMethod = targetPart.split('.').pop() || targetPart;
  return { source, targetMethod };
}
