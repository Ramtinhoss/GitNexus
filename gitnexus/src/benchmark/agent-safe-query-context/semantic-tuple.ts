import type { SemanticTuple } from './types.js';

export function semanticTuplePass(actual: SemanticTuple, expected: SemanticTuple): boolean {
  return JSON.stringify(normalizeTuple(actual)) === JSON.stringify(normalizeTuple(expected));
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
