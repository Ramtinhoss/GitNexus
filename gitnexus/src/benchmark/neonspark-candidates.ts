import fs from 'node:fs/promises';
import path from 'node:path';
import { listRegisteredRepos } from '../storage/repo-manager.js';
import { closeKuzu, executeQuery, initKuzu } from '../mcp/core/kuzu-adapter.js';

const ALLOWED_PREFIXES = ['Assets/NEON/Code/', 'Packages/com.veewo.', 'Packages/com.neonspark.'];

export function filterNeonsparkPaths<T extends { file_path?: string }>(rows: T[]): T[] {
  return rows.filter((r) => {
    const p = (r.file_path || '').replace(/\\/g, '/');
    return ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
  });
}

export function toCandidateRow(row: any) {
  return {
    symbol_uid: String(row.symbol_uid),
    file_path: String(row.file_path),
    symbol_name: String(row.symbol_name),
    symbol_type: String(row.symbol_type),
    start_line: Number(row.start_line || 0),
    end_line: Number(row.end_line || 0),
  };
}

export async function extractCandidates(repoName: string, outFile: string): Promise<number> {
  const repos = await listRegisteredRepos({ validate: true });
  const repo = repos.find((r) => r.name === repoName);
  if (!repo) throw new Error(`repo not indexed: ${repoName}`);

  await initKuzu(repoName, path.join(repo.storagePath, 'kuzu'));
  try {
    const rows = await executeQuery(repoName, `
      MATCH (s)
      WHERE (s:Class OR s:Interface OR s:Method OR s:Function)
      RETURN s.id AS symbol_uid,
             s.filePath AS file_path,
             s.name AS symbol_name,
             labels(s)[0] AS symbol_type,
             COALESCE(s.startLine, 0) AS start_line,
             COALESCE(s.endLine, 0) AS end_line
    `);

    const normalized = filterNeonsparkPaths(rows.map(toCandidateRow));
    const jsonl = normalized.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, jsonl, 'utf-8');
    return normalized.length;
  } finally {
    await closeKuzu(repoName);
  }
}
