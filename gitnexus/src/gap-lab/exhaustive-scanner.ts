import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ExhaustiveGapSubtype } from './pattern-library.js';
import { getExhaustivePattern } from './pattern-library.js';

export interface LexicalMatch {
  gapSubtype: ExhaustiveGapSubtype;
  patternId: string;
  file: string;
  line: number;
  text: string;
}

export interface LexicalScanInput {
  repoPath: string;
  gapSubtype: ExhaustiveGapSubtype;
  scopePath?: string;
  timeoutMs?: number;
}

export interface LexicalScanOutput {
  gapSubtype: ExhaustiveGapSubtype;
  patternId: string;
  engine: 'ripgrep' | 'fallback';
  matches: LexicalMatch[];
}

function normalizeFile(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function safeScope(repoPath: string, scopePath?: string): string {
  if (!scopePath) return repoPath;
  const abs = path.resolve(repoPath, scopePath);
  const rel = path.relative(repoPath, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return repoPath;
  return abs;
}

function parseRipgrepLines(raw: string, gapSubtype: ExhaustiveGapSubtype, patternId: string): LexicalMatch[] {
  const rows = raw.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const out: LexicalMatch[] = [];
  for (const row of rows) {
    const firstColon = row.indexOf(':');
    const secondColon = firstColon >= 0 ? row.indexOf(':', firstColon + 1) : -1;
    if (firstColon <= 0 || secondColon <= firstColon) continue;
    const file = row.slice(0, firstColon);
    const lineNum = Number.parseInt(row.slice(firstColon + 1, secondColon), 10);
    const text = row.slice(secondColon + 1);
    if (!Number.isFinite(lineNum)) continue;
    out.push({
      gapSubtype,
      patternId,
      file: normalizeFile(file),
      line: lineNum,
      text,
    });
  }
  return out;
}

async function listCsharpFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.cs')) continue;
      out.push(abs);
    }
  }
  return out;
}

async function fallbackScan(input: {
  repoPath: string;
  scopeRoot: string;
  gapSubtype: ExhaustiveGapSubtype;
  patternId: string;
  jsPattern: RegExp;
}): Promise<LexicalMatch[]> {
  const files = await listCsharpFiles(input.scopeRoot);
  const out: LexicalMatch[] = [];
  for (const abs of files) {
    const raw = await fs.readFile(abs, 'utf-8');
    const lines = raw.split('\n');
    for (let idx = 0; idx < lines.length; idx += 1) {
      if (!input.jsPattern.test(lines[idx])) continue;
      out.push({
        gapSubtype: input.gapSubtype,
        patternId: input.patternId,
        file: normalizeFile(path.relative(input.repoPath, abs)),
        line: idx + 1,
        text: lines[idx],
      });
    }
  }
  return out;
}

export async function scanLexicalUniverse(input: LexicalScanInput): Promise<LexicalScanOutput> {
  const repoPath = path.resolve(input.repoPath);
  const pattern = getExhaustivePattern(input.gapSubtype);
  const scopeRoot = safeScope(repoPath, input.scopePath);
  const timeoutMs = input.timeoutMs ?? 15_000;

  const relativeScope = normalizeFile(path.relative(repoPath, scopeRoot) || '.');
  const rgArgs = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    '-g',
    '*.cs',
    pattern.rgPattern,
    relativeScope,
  ];

  try {
    const raw = execFileSync('rg', rgArgs, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: timeoutMs,
    });
    const matches = parseRipgrepLines(raw, input.gapSubtype, pattern.patternId);
    return {
      gapSubtype: input.gapSubtype,
      patternId: pattern.patternId,
      engine: 'ripgrep',
      matches,
    };
  } catch (error: any) {
    if (error?.status === 1) {
      return {
        gapSubtype: input.gapSubtype,
        patternId: pattern.patternId,
        engine: 'ripgrep',
        matches: [],
      };
    }
    const matches = await fallbackScan({
      repoPath,
      scopeRoot,
      gapSubtype: input.gapSubtype,
      patternId: pattern.patternId,
      jsPattern: pattern.jsPattern,
    });
    return {
      gapSubtype: input.gapSubtype,
      patternId: pattern.patternId,
      engine: 'fallback',
      matches,
    };
  }
}

