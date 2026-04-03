export interface RuntimeSymbolCandidate {
  id: string;
  name: string;
  type: string;
  filePath: string;
  startLine?: number;
}

export interface RuntimeCallEdge {
  sourceId: string;
  sourceName: string;
  sourceFilePath: string;
  sourceStartLine?: number;
  targetId: string;
  targetName: string;
  targetFilePath: string;
  targetStartLine?: number;
}

interface QueryExecutor {
  (query: string, params?: Record<string, unknown>): Promise<any[]>;
}

const CALL_EDGE_QUERY_LIMIT = 40;

export function callEdgeKey(edge: RuntimeCallEdge): string {
  return `${edge.sourceId}->${edge.targetId}`;
}

export function dedupeCallEdges(edges: RuntimeCallEdge[]): RuntimeCallEdge[] {
  return edges.filter((edge, index, list) =>
    list.findIndex((other) => callEdgeKey(other) === callEdgeKey(edge)) === index);
}

export function symbolCandidateFromCallEdgeTarget(edge: RuntimeCallEdge): RuntimeSymbolCandidate | undefined {
  if (!edge.targetId || !edge.targetFilePath) return undefined;
  return {
    id: edge.targetId,
    name: edge.targetName,
    type: String(edge.targetId.split(':')[0] || 'Method'),
    filePath: edge.targetFilePath,
    startLine: edge.targetStartLine,
  };
}

export async function fetchAnchoredCallEdges(
  executeParameterized: QueryExecutor,
  symbol: RuntimeSymbolCandidate,
): Promise<RuntimeCallEdge[]> {
  if (!symbol?.id) return [];
  const symbolId = symbol.id;
  const directQueries = [
    executeParameterized(`
      MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)
      RETURN s.id AS sourceId, s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
             t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine
      LIMIT ${CALL_EDGE_QUERY_LIMIT}
    `, { symbolId }),
    executeParameterized(`
      MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(t {id: $symbolId})
      RETURN s.id AS sourceId, s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
             t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine
      LIMIT ${CALL_EDGE_QUERY_LIMIT}
    `, { symbolId }),
  ];

  const containerType = String(symbol.type || '').toLowerCase();
  const isMethodContainer = new Set(['class', 'interface', 'struct', 'trait', 'impl', 'record']).has(containerType)
    || String(symbol.id).toLowerCase().startsWith('class:');
  if (isMethodContainer) {
    directQueries.push(
      executeParameterized(`
        MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
        MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)
        RETURN m.id AS sourceId, m.name AS sourceName, m.filePath AS sourceFilePath, m.startLine AS sourceStartLine,
               t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine
        LIMIT ${CALL_EDGE_QUERY_LIMIT}
      `, { symbolId }),
      executeParameterized(`
        MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
        MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(m)
        RETURN s.id AS sourceId, s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
               m.id AS targetId, m.name AS targetName, m.filePath AS targetFilePath, m.startLine AS targetStartLine
        LIMIT ${CALL_EDGE_QUERY_LIMIT}
      `, { symbolId }),
    );
  }

  const rows = await Promise.all(directQueries);
  return dedupeCallEdges(
    rows.flatMap((rowSet) => rowSet || [])
      .map((row) => ({
        sourceId: String(row.sourceId || ''),
        sourceName: String(row.sourceName || ''),
        sourceFilePath: String(row.sourceFilePath || ''),
        sourceStartLine: Number.isFinite(Number(row.sourceStartLine)) ? Number(row.sourceStartLine) : undefined,
        targetId: String(row.targetId || ''),
        targetName: String(row.targetName || ''),
        targetFilePath: String(row.targetFilePath || ''),
        targetStartLine: Number.isFinite(Number(row.targetStartLine)) ? Number(row.targetStartLine) : undefined,
      }))
      .filter((row) => row.sourceId && row.targetId && row.sourceFilePath && row.targetFilePath),
  );
}
