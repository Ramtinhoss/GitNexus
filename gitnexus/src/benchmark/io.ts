import fs from 'node:fs/promises';
import path from 'node:path';
import type { RelationCase, SymbolCase, TaskCase, Thresholds } from './types.js';

export async function loadBenchmarkDataset(root: string): Promise<{
  thresholds: Thresholds;
  symbols: SymbolCase[];
  relations: RelationCase[];
  tasks: TaskCase[];
}> {
  const thresholds = JSON.parse(
    await fs.readFile(path.join(root, 'thresholds.json'), 'utf-8'),
  ) as Thresholds;
  const symbols = await readJsonl<SymbolCase>(
    path.join(root, 'symbols.jsonl'),
    ['symbol_uid', 'file_path', 'symbol_name', 'symbol_type', 'start_line', 'end_line'],
  );
  const relations = await readJsonl<RelationCase>(
    path.join(root, 'relations.jsonl'),
    ['src_uid', 'edge_type', 'dst_uid', 'must_exist'],
  );
  const tasks = await readJsonl<TaskCase>(
    path.join(root, 'tasks.jsonl'),
    ['tool', 'input', 'must_hit_uids', 'must_not_hit_uids'],
  );

  return { thresholds, symbols, relations, tasks };
}

async function readJsonl<T>(file: string, required: string[]): Promise<T[]> {
  const raw = await fs.readFile(file, 'utf-8');
  const rows = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  for (const row of rows) {
    for (const key of required) {
      if (!(key in row)) {
        throw new Error(`missing required field: ${key}`);
      }
    }
  }

  return rows as T[];
}
