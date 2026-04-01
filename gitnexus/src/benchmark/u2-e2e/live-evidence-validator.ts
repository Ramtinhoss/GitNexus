import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LiveEvidenceRow {
  timestamp: string;
  command: string;
  flags: Record<string, unknown>;
  request_excerpt: string;
  response_excerpt: string;
  segment: string;
  hop_anchor: string;
}

export interface LiveEvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRow(row: any, index: number): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(row?.timestamp)) errors.push(`row ${index + 1}: missing timestamp`);
  if (!isNonEmptyString(row?.command)) errors.push(`row ${index + 1}: missing command`);
  if (!row || typeof row !== 'object' || !row.flags || typeof row.flags !== 'object') {
    errors.push(`row ${index + 1}: missing flags object`);
  }
  if (!isNonEmptyString(row?.request_excerpt)) errors.push(`row ${index + 1}: missing request_excerpt`);
  if (!isNonEmptyString(row?.response_excerpt)) errors.push(`row ${index + 1}: missing response_excerpt`);
  if (!isNonEmptyString(row?.segment)) errors.push(`row ${index + 1}: missing segment`);
  if (!isNonEmptyString(row?.hop_anchor)) errors.push(`row ${index + 1}: missing hop_anchor`);
  return errors;
}

export function validateLiveEvidenceRows(rows: unknown[]): LiveEvidenceValidationResult {
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    errors.push(...validateRow(rows[i], i));
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function parseLiveEvidenceJsonl(raw: string): { rows: unknown[]; errors: string[] } {
  const errors: string[] = [];
  const rows: unknown[] = [];
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  lines.forEach((line, index) => {
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      errors.push(`line ${index + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  });

  return { rows, errors };
}

export async function validateLiveEvidenceJsonlFile(inputPath: string): Promise<LiveEvidenceValidationResult> {
  const raw = await fs.readFile(inputPath, 'utf-8');
  const parsed = parseLiveEvidenceJsonl(raw);
  if (parsed.errors.length > 0) {
    return { valid: false, errors: parsed.errors };
  }
  return validateLiveEvidenceRows(parsed.rows);
}

function parseCliInputArg(argv: string[]): string {
  const index = argv.indexOf('--input');
  if (index < 0) return '';
  return String(argv[index + 1] || '').trim();
}

async function runCli(): Promise<void> {
  const input = parseCliInputArg(process.argv);
  if (!input) {
    throw new Error('Usage: node dist/benchmark/u2-e2e/live-evidence-validator.js --input <jsonl-path>');
  }

  const resolved = path.resolve(input);
  const result = await validateLiveEvidenceJsonlFile(resolved);
  if (!result.valid) {
    throw new Error(`live evidence validation failed:\n${result.errors.map((row) => `- ${row}`).join('\n')}`);
  }
  process.stdout.write(`live evidence validation passed: ${resolved}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (entryPath && entryPath === thisPath) {
  runCli().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${msg}\n`);
    process.exitCode = 1;
  });
}
