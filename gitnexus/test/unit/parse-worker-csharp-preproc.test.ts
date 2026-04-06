import { describe, it, expect } from 'vitest';
import { createKnowledgeGraph } from '../../src/core/graph/graph.js';
import { createASTCache } from '../../src/core/ingestion/ast-cache.js';
import { processParsing } from '../../src/core/ingestion/parsing-processor.js';
import { createSymbolTable } from '../../src/core/ingestion/symbol-table.js';
import type { WorkerPool } from '../../src/core/ingestion/workers/worker-pool.js';

describe('processParsing worker csharp preproc diagnostics', () => {
  it('aggregates worker raw fallback parse counts', async () => {
    const graph = createKnowledgeGraph();
    const symbolTable = createSymbolTable();
    const astCache = createASTCache();

    const fakeWorkerPool: WorkerPool = {
      size: 1,
      dispatch: async () => [{
        nodes: [],
        relationships: [],
        symbols: [],
        imports: [],
        calls: [],
        heritage: [],
        routes: [],
        constructorBindings: [],
        skippedLanguages: {},
        csharpPreprocFallbackFiles: 2,
        fileCount: 1,
      }],
      terminate: async () => undefined,
    };

    let fallbackCount = 0;
    const extracted = await processParsing(
      graph,
      [{ path: 'Demo.cs', content: 'public class Demo {}' }],
      symbolTable,
      astCache,
      undefined,
      fakeWorkerPool,
      (count) => { fallbackCount += count; },
    );

    expect(extracted).not.toBeNull();
    expect(fallbackCount).toBe(2);
  });
});
