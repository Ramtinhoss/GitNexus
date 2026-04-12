import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyScopePath } from './scope-classifier.js';

export interface CandidateAnchor {
  file: string;
  line: number;
  symbol: string;
  symbolId?: string;
}

export type SyncVarRecoveryReason =
  | 'handler_symbol_unresolved'
  | 'unresolved_host_type'
  | 'unresolved_field_symbol'
  | 'missing_runtime_source_anchor'
  | 'ambiguous_source_anchor';

export interface SyncVarAnchorRecovery {
  hostClassName?: string;
  fieldName?: string;
  declarationAnchor?: CandidateAnchor;
  targetAnchor?: CandidateAnchor;
  sourceAnchor?: CandidateAnchor;
  sourceAnchorCandidates?: CandidateAnchor[];
  reasonCode?: SyncVarRecoveryReason;
}

interface ParsedMethod {
  className: string;
  methodName: string;
  line: number;
}

const METHOD_RE = /^\s*(?:\[[^\]]+\]\s*)*(?:(?:public|private|protected|internal|static|virtual|override|sealed|abstract|async|extern|unsafe|new|partial)\s+)*(?:[A-Za-z_][A-Za-z0-9_<>,.\[\]?]*\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:\{|=>)?\s*$/;
const CLASS_RE = /\b(?:public|private|protected|internal|abstract|sealed|static|partial)\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\b|\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
const FIELD_RE = /^\s*(?:\[[^\]]+\]\s*)*(?:(?:public|private|protected|internal|static|readonly|volatile|new|sealed)\s+)*(?:[A-Za-z_][A-Za-z0-9_<>,.\[\]?]*\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|;|\{)/;
const CONTROL_KEYWORDS = new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'using', 'lock', 'return']);

function normalizeFile(filePath: string): string {
  return filePath.split(path.sep).join('/').replace(/^\.\/+/, '');
}

async function listCsharpFiles(root: string): Promise<string[]> {
  const files: string[] = [];
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
      if (entry.isFile() && entry.name.endsWith('.cs')) files.push(abs);
    }
  }
  return files;
}

async function readLines(absPath: string): Promise<string[]> {
  return (await fs.readFile(absPath, 'utf-8')).split(/\r?\n/);
}

function findNearestClassName(lines: string[], lineIndex: number): string | undefined {
  for (let idx = Math.min(lineIndex, lines.length - 1); idx >= 0; idx -= 1) {
    const match = lines[idx]?.match(CLASS_RE);
    if (match) return String(match[1] || match[2] || '').trim() || undefined;
  }
  return undefined;
}

function parseMethodName(line: string): string | undefined {
  const match = line.match(METHOD_RE);
  const methodName = String(match?.[1] || '').trim();
  if (!methodName || CONTROL_KEYWORDS.has(methodName)) return undefined;
  return methodName;
}

function findEnclosingMethod(lines: string[], lineIndex: number): ParsedMethod | undefined {
  for (let idx = Math.min(lineIndex, lines.length - 1); idx >= 0; idx -= 1) {
    const methodName = parseMethodName(lines[idx] || '');
    if (!methodName) continue;
    const className = findNearestClassName(lines, idx);
    if (!className) continue;
    return {
      className,
      methodName,
      line: idx + 1,
    };
  }
  return undefined;
}

function findFieldDeclaration(lines: string[], lineIndex: number): { fieldName?: string; line?: number } {
  const start = Math.max(0, lineIndex - 1);
  const end = Math.min(lines.length - 1, lineIndex + 6);
  for (let idx = start; idx <= end; idx += 1) {
    const match = lines[idx]?.match(FIELD_RE);
    if (match) {
      return {
        fieldName: String(match[1] || '').trim() || undefined,
        line: idx + 1,
      };
    }
  }
  return {};
}

async function findHostFiles(repoPath: string, hostClassName: string): Promise<string[]> {
  const files = await listCsharpFiles(repoPath);
  const out: string[] = [];
  for (const absPath of files) {
    const raw = await fs.readFile(absPath, 'utf-8');
    if (new RegExp(`\\bclass\\s+${hostClassName}\\b`).test(raw)) {
      out.push(absPath);
    }
  }
  return out;
}

async function findHandlerAnchor(hostFiles: string[], repoPath: string, hostClassName: string, handlerSymbol: string): Promise<CandidateAnchor | undefined> {
  for (const absPath of hostFiles) {
    const lines = await readLines(absPath);
    for (let idx = 0; idx < lines.length; idx += 1) {
      const methodName = parseMethodName(lines[idx] || '');
      if (methodName !== handlerSymbol) continue;
      const className = findNearestClassName(lines, idx);
      if (className !== hostClassName) continue;
      const rel = normalizeFile(path.relative(repoPath, absPath));
      return {
        file: rel,
        line: idx + 1,
        symbol: `${hostClassName}.${handlerSymbol}`,
        symbolId: `Method:${rel}:${handlerSymbol}`,
      };
    }
  }
  return undefined;
}

function variableLooksTypedAsHost(lines: string[], hostClassName: string, variableName: string): boolean {
  const typeRe = new RegExp(`\\b${hostClassName}\\s+${variableName}\\b`);
  return lines.some((line) => typeRe.test(line));
}

function makeMethodAnchor(repoPath: string, absPath: string, parsed: ParsedMethod): CandidateAnchor {
  const rel = normalizeFile(path.relative(repoPath, absPath));
  return {
    file: rel,
    line: parsed.line,
    symbol: `${parsed.className}.${parsed.methodName}`,
    symbolId: `Method:${rel}:${parsed.methodName}`,
  };
}

function uniqueAnchors(anchors: CandidateAnchor[]): CandidateAnchor[] {
  const seen = new Set<string>();
  const out: CandidateAnchor[] = [];
  for (const anchor of anchors) {
    const key = `${anchor.file}:${anchor.line}:${anchor.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(anchor);
  }
  return out;
}

async function collectSourceAnchors(input: {
  repoPath: string;
  hostClassName: string;
  fieldName: string;
  hostFiles: string[];
}): Promise<CandidateAnchor[]> {
  const repoFiles = await listCsharpFiles(input.repoPath);
  const anchors: CandidateAnchor[] = [];
  const directFieldAssignRe = new RegExp(`(?:^|[^.\\w])(?:this\\.)?${input.fieldName}\\s*=`);
  const instanceAssignRe = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\.${input.fieldName}\\s*=`);

  for (const absPath of repoFiles) {
    const rel = normalizeFile(path.relative(input.repoPath, absPath));
    if (classifyScopePath(rel).scopeClass !== 'user_code') continue;
    const lines = await readLines(absPath);
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx] || '';
      const enclosing = findEnclosingMethod(lines, idx);
      if (!enclosing) continue;

      if (directFieldAssignRe.test(line) && enclosing.className === input.hostClassName) {
        anchors.push(makeMethodAnchor(input.repoPath, absPath, enclosing));
        continue;
      }

      const instanceMatch = line.match(instanceAssignRe);
      if (!instanceMatch) continue;
      const variableName = String(instanceMatch[1] || '').trim();
      if (!variableName) continue;
      if (!variableLooksTypedAsHost(lines, input.hostClassName, variableName)) continue;
      anchors.push(makeMethodAnchor(input.repoPath, absPath, enclosing));
    }
  }

  return uniqueAnchors(anchors);
}

export async function recoverSyncVarAnchors(input: {
  repoPath: string;
  file: string;
  line: number;
  handlerSymbol: string;
}): Promise<SyncVarAnchorRecovery> {
  const absPath = path.join(path.resolve(input.repoPath), input.file);
  const lines = await readLines(absPath);
  const hostClassName = findNearestClassName(lines, input.line - 1);
  if (!hostClassName) {
    return {
      reasonCode: 'unresolved_host_type',
    };
  }

  const fieldDecl = findFieldDeclaration(lines, input.line - 1);
  const fieldName = String(fieldDecl.fieldName || '').trim();
  if (!fieldName) {
    return {
      hostClassName,
      reasonCode: 'unresolved_field_symbol',
    };
  }

  const declarationAnchor: CandidateAnchor = {
    file: normalizeFile(input.file),
    line: Number(fieldDecl.line || input.line),
    symbol: `${hostClassName}.${fieldName}`,
    symbolId: `Field:${normalizeFile(input.file)}:${fieldName}`,
  };

  const hostFiles = await findHostFiles(input.repoPath, hostClassName);
  const targetAnchor = await findHandlerAnchor(hostFiles, input.repoPath, hostClassName, input.handlerSymbol);
  if (!targetAnchor) {
    return {
      hostClassName,
      fieldName,
      declarationAnchor,
      reasonCode: 'handler_symbol_unresolved',
    };
  }

  const sourceAnchorCandidates = await collectSourceAnchors({
    repoPath: input.repoPath,
    hostClassName,
    fieldName,
    hostFiles,
  });

  if (sourceAnchorCandidates.length === 1) {
    return {
      hostClassName,
      fieldName,
      declarationAnchor,
      targetAnchor,
      sourceAnchor: sourceAnchorCandidates[0],
      sourceAnchorCandidates,
    };
  }

  return {
    hostClassName,
    fieldName,
    declarationAnchor,
    targetAnchor,
    sourceAnchorCandidates,
    reasonCode: sourceAnchorCandidates.length > 1
      ? 'ambiguous_source_anchor'
      : 'missing_runtime_source_anchor',
  };
}
