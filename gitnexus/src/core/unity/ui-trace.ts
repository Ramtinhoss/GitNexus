import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { scanUiAssetRefs } from './ui-asset-ref-scanner.js';
import { parseUxmlRefs } from './uxml-ref-parser.js';
import { parseUssSelectors } from './uss-selector-parser.js';
import { extractCsharpSelectorBindings } from './csharp-selector-binding.js';
import { buildUnityUiMetaIndex } from './ui-meta-index.js';
import { buildMetaIndex } from './meta-index.js';

export type UnityUiTraceGoal = 'asset_refs' | 'template_refs' | 'selector_bindings';
export type UnityUiSelectorMode = 'strict' | 'balanced';

export interface UnityUiTraceEvidenceHop {
  path: string;
  line: number;
  snippet: string;
}

export interface UnityUiTraceResult {
  key: string;
  evidence_chain: UnityUiTraceEvidenceHop[];
  score?: number;
  confidence?: 'high' | 'medium' | 'low';
}

export interface UnityUiTraceDiagnostic {
  code: 'ambiguous' | 'not_found';
  message: string;
  candidates: UnityUiTraceEvidenceHop[];
}

export interface UnityUiTraceOutput {
  goal: UnityUiTraceGoal;
  target: string;
  results: UnityUiTraceResult[];
  diagnostics: UnityUiTraceDiagnostic[];
}

export interface UnityUiTraceInput {
  repoRoot: string;
  target: string;
  goal: UnityUiTraceGoal;
  selectorMode?: UnityUiSelectorMode;
}

export async function runUnityUiTrace(input: UnityUiTraceInput): Promise<UnityUiTraceOutput> {
  const target = String(input.target || '').trim();
  const goal = input.goal;
  const selectorMode = input.selectorMode || 'balanced';
  const key = canonicalKey(target);
  const uiMeta = await buildUnityUiMetaIndex(input.repoRoot);

  const uxmlCandidates = resolveTargetUxmlCandidates(input.repoRoot, target, key, uiMeta.uxmlGuidToPath);
  const diagnostics: UnityUiTraceDiagnostic[] = [];

  if (uxmlCandidates.length === 0) {
    return {
      goal,
      target,
      results: [],
      diagnostics: [
        {
          code: 'not_found',
          message: 'No matching UXML target found.',
          candidates: [],
        },
      ],
    };
  }

  if (uxmlCandidates.length > 1) {
    return {
      goal,
      target,
      results: [],
      diagnostics: [
        {
          code: 'ambiguous',
          message: 'Target resolves to multiple UXML files.',
          candidates: uxmlCandidates.map((candidate) => ({ path: candidate, line: 1, snippet: 'target-candidate' })),
        },
      ],
    };
  }

  const targetUxmlPath = uxmlCandidates[0];
  const results = await resolveGoal({
    repoRoot: input.repoRoot,
    goal,
    selectorMode,
    target,
    targetKey: key,
    targetUxmlPath,
    uiMeta,
  });

  if (results.length === 0) {
    diagnostics.push({
      code: 'not_found',
      message: 'No evidence chain found.',
      candidates: [],
    });
    return { goal, target, results: [], diagnostics };
  }

  return { goal, target, results, diagnostics };
}

async function resolveGoal(input: {
  repoRoot: string;
  goal: UnityUiTraceGoal;
  selectorMode: UnityUiSelectorMode;
  target: string;
  targetKey: string;
  targetUxmlPath: string;
  uiMeta: Awaited<ReturnType<typeof buildUnityUiMetaIndex>>;
}): Promise<UnityUiTraceResult[]> {
  if (input.goal === 'asset_refs') {
    const targetUxmlGuid = findGuidForUxmlPath(input.targetUxmlPath, input.uiMeta.uxmlGuidToPath);
    if (!targetUxmlGuid) return [];
    const refs = await scanUiAssetRefs({
      repoRoot: input.repoRoot,
      targetGuids: [targetUxmlGuid],
    });
    return refs
      .filter((row) => row.guid === targetUxmlGuid)
      .map((row, index) => ({
        key: `${row.sourcePath}:${row.line}:${index}`,
        evidence_chain: [
          { path: row.sourcePath, line: row.line, snippet: row.snippet },
          { path: input.targetUxmlPath, line: 1, snippet: 'resolved-by-guid' },
        ],
      }));
  }

  if (input.goal === 'template_refs') {
    const source = await safeRead(path.join(input.repoRoot, input.targetUxmlPath));
    const parsed = parseUxmlRefs(source);
    const templates = parsed.templates
      .map((template) => ({
        template,
        resolvedPath: input.uiMeta.uxmlGuidToPath.get(template.guid),
      }))
      .filter((row): row is { template: typeof parsed.templates[number]; resolvedPath: string } => Boolean(row.resolvedPath));

    return templates.map((row, index) => ({
      key: `${row.resolvedPath}:${row.template.line}:${index}`,
      evidence_chain: [
        { path: input.targetUxmlPath, line: row.template.line, snippet: row.template.snippet },
        { path: row.resolvedPath, line: 1, snippet: 'template-target' },
      ],
    }));
  }

  const scriptPaths = await resolveScriptPathsForSelectorTarget(
    input.repoRoot,
    input.target,
    input.targetUxmlPath,
    input.targetKey,
    input.uiMeta,
  );
  const csharpBindings = await scanCsharpBindings(input.repoRoot, input.targetKey, scriptPaths);
  const styles = await resolveStyleSelectorsForUxml(input.repoRoot, input.targetUxmlPath, input.uiMeta);
  const styleSelectorTokenIndex = buildStyleSelectorTokenIndex(styles, input.selectorMode);
  const selectorMatches: Array<UnityUiTraceResult & { score: number }> = [];

  for (const binding of csharpBindings) {
    const normalizedClass = normalizeClassToken(binding.className);
    if (!normalizedClass) continue;
    const styleEvidenceList = styleSelectorTokenIndex.get(normalizedClass) || [];
    for (const styleEvidence of styleEvidenceList) {
      const score = scoreSelectorBindingMatch(binding, styleEvidence, input.targetKey);
      selectorMatches.push({
        key: `${binding.path}:${binding.line}:${styleEvidence.path}:${styleEvidence.line}:${normalizedClass}`,
        score,
        evidence_chain: [
          { path: binding.path, line: binding.line, snippet: binding.snippet },
          { path: styleEvidence.path, line: styleEvidence.line, snippet: styleEvidence.snippet },
        ],
      });
    }
  }

  selectorMatches.sort((left, right) => {
    const scoreDiff = (right.score || 0) - (left.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const leftHop = left.evidence_chain[0];
    const rightHop = right.evidence_chain[0];
    const pathDiff = leftHop.path.localeCompare(rightHop.path);
    if (pathDiff !== 0) return pathDiff;
    return leftHop.line - rightHop.line;
  });

  return dedupeTraceResults(selectorMatches);
}

function resolveTargetUxmlCandidates(
  repoRoot: string,
  target: string,
  targetKey: string,
  uxmlGuidToPath: Map<string, string>,
): string[] {
  const normalizedTarget = normalizeUxmlTargetPath(repoRoot, target);
  if (normalizedTarget) {
    const exactPath = findExactUxmlPath(normalizedTarget, uxmlGuidToPath);
    if (exactPath) {
      return [exactPath];
    }
  }

  const set = new Set<string>();
  for (const p of uxmlGuidToPath.values()) {
    if (canonicalKey(path.basename(p, '.uxml')) === targetKey) {
      set.add(p);
    }
  }
  return [...set];
}

function canonicalKey(input: string): string {
  return String(input || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/\.uxml$/i, '')
    .replace(/controller$/i, '')
    .replace(/new$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

async function scanCsharpBindings(
  repoRoot: string,
  targetKey: string,
  preferredScriptPaths: string[] = [],
): Promise<Array<{
  path: string;
  line: number;
  snippet: string;
  className: string;
  source: 'resource_chain' | 'name_fallback';
}>> {
  const preferredSet = new Set(preferredScriptPaths);
  const fallbackScriptPaths = (await glob('**/*.cs', { cwd: repoRoot, nodir: true, dot: false }))
    .filter((scriptPath) => canonicalKey(path.basename(scriptPath, '.cs')) === targetKey);
  const scriptPaths = [...new Set([...preferredScriptPaths, ...fallbackScriptPaths])]
    .sort((left, right) => left.localeCompare(right));

  const out: Array<{
    path: string;
    line: number;
    snippet: string;
    className: string;
    source: 'resource_chain' | 'name_fallback';
  }> = [];
  for (const scriptPath of scriptPaths) {
    const source = await safeRead(path.join(repoRoot, scriptPath));
    const bindings = extractCsharpSelectorBindings(source);
    for (const binding of bindings) {
      out.push({
        path: scriptPath.replace(/\\/g, '/'),
        line: binding.line,
        snippet: binding.snippet,
        className: binding.className,
        source: preferredSet.has(scriptPath) ? 'resource_chain' : 'name_fallback',
      });
    }
  }
  return out;
}

async function resolveScriptPathsForSelectorTarget(
  repoRoot: string,
  target: string,
  targetUxmlPath: string,
  targetKey: string,
  uiMeta: Awaited<ReturnType<typeof buildUnityUiMetaIndex>>,
): Promise<string[]> {
  const normalizedTarget = normalizeUxmlTargetPath(repoRoot, target);
  const isPathTarget = Boolean(normalizedTarget && findExactUxmlPath(normalizedTarget, uiMeta.uxmlGuidToPath));
  if (!isPathTarget) {
    return [];
  }

  const targetUxmlGuid = findGuidForUxmlPath(targetUxmlPath, uiMeta.uxmlGuidToPath);
  if (!targetUxmlGuid) return [];

  const assetRefs = await scanUiAssetRefs({
    repoRoot,
    targetGuids: [targetUxmlGuid],
  });
  const sourcePaths = [...new Set(assetRefs.map((row) => row.sourcePath))];
  if (sourcePaths.length === 0) return [];
  const scopedRefs = await scanUiAssetRefs({
    repoRoot,
    scopedPaths: sourcePaths,
  });
  const scriptGuids = [...new Set(
    scopedRefs
      .filter((row) => row.fieldName === 'm_Script')
      .map((row) => row.guid.toLowerCase()),
  )];
  if (scriptGuids.length === 0) return [];

  const scriptMeta = await buildMetaIndex(repoRoot);
  if (scriptMeta.size === 0) return [];
  const lowerToPath = new Map<string, string>();
  for (const [guid, scriptPath] of scriptMeta.entries()) {
    lowerToPath.set(guid.toLowerCase(), scriptPath.replace(/\\/g, '/'));
  }

  const scriptPaths = scriptGuids
    .map((guid) => lowerToPath.get(guid))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  if (scriptPaths.length > 0) {
    return [...new Set(scriptPaths)];
  }

  return (await glob('**/*.cs', { cwd: repoRoot, nodir: true, dot: false }))
    .filter((scriptPath) => canonicalKey(path.basename(scriptPath, '.cs')) === targetKey)
    .sort((left, right) => left.localeCompare(right));
}

async function resolveStyleSelectorsForUxml(
  repoRoot: string,
  uxmlPath: string,
  uiMeta: Awaited<ReturnType<typeof buildUnityUiMetaIndex>>,
): Promise<Array<{ path: string; line: number; snippet: string; selector: string }>> {
  const uxmlSource = await safeRead(path.join(repoRoot, uxmlPath));
  const parsed = parseUxmlRefs(uxmlSource);
  const stylePaths = parsed.styles
    .map((style) => uiMeta.ussGuidToPath.get(style.guid))
    .filter((value): value is string => Boolean(value));

  const out: Array<{ path: string; line: number; snippet: string; selector: string }> = [];
  for (const ussPath of stylePaths) {
    const ussSource = await safeRead(path.join(repoRoot, ussPath));
    for (const selector of parseUssSelectors(ussSource)) {
      out.push({
        path: ussPath,
        line: selector.line,
        snippet: selector.snippet,
        selector: selector.selector,
      });
    }
  }
  return out;
}

async function safeRead(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

function normalizeUxmlTargetPath(repoRoot: string, target: string): string | null {
  const normalizedTarget = String(target || '').trim().replace(/\\/g, '/');
  if (!normalizedTarget.toLowerCase().endsWith('.uxml')) return null;
  const relative = path.isAbsolute(normalizedTarget)
    ? path.relative(repoRoot, normalizedTarget).replace(/\\/g, '/')
    : normalizedTarget;
  if (relative.startsWith('../')) return null;
  return relative;
}

function findExactUxmlPath(targetPath: string, uxmlGuidToPath: Map<string, string>): string | null {
  for (const candidate of uxmlGuidToPath.values()) {
    if (candidate.toLowerCase() === targetPath.toLowerCase()) {
      return candidate;
    }
  }
  return null;
}

function findGuidForUxmlPath(targetUxmlPath: string, uxmlGuidToPath: Map<string, string>): string | null {
  for (const [guid, assetPath] of uxmlGuidToPath.entries()) {
    if (assetPath !== targetUxmlPath) continue;
    if (!/^[0-9a-f]{32}$/i.test(guid)) continue;
    return guid.toLowerCase();
  }
  return null;
}

function buildStyleSelectorTokenIndex(
  styles: Array<{ path: string; line: number; snippet: string; selector: string }>,
  selectorMode: UnityUiSelectorMode,
): Map<string, Array<{ path: string; line: number; snippet: string; selector: string }>> {
  const index = new Map<string, Array<{ path: string; line: number; snippet: string; selector: string }>>();
  for (const style of styles) {
    for (const token of extractClassTokens(style.selector, selectorMode)) {
      const bucket = index.get(token) || [];
      bucket.push(style);
      index.set(token, bucket);
    }
  }
  return index;
}

function extractClassTokens(selector: string, selectorMode: UnityUiSelectorMode): string[] {
  if (selectorMode === 'strict') {
    const trimmed = selector.trim();
    if (/^\.[A-Za-z_][A-Za-z0-9_-]*$/.test(trimmed)) {
      return [trimmed.slice(1)];
    }
    return [];
  }
  const out = new Set<string>();
  const pattern = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;
  let match = pattern.exec(selector);
  while (match) {
    const token = normalizeClassToken(match[1]);
    if (token) out.add(token);
    match = pattern.exec(selector);
  }
  return [...out];
}

function normalizeClassToken(value: string): string {
  return String(value || '').trim();
}

function dedupeTraceResults(results: UnityUiTraceResult[]): UnityUiTraceResult[] {
  const seen = new Set<string>();
  const out: UnityUiTraceResult[] = [];
  for (const result of results) {
    const signature = result.evidence_chain.map((hop) => `${hop.path}:${hop.line}:${hop.snippet}`).join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    const score = result.score;
    out.push({
      ...result,
      confidence: toConfidence(score),
    });
  }
  return out;
}

function toConfidence(score?: number): 'high' | 'medium' | 'low' {
  const value = Number(score || 0);
  if (value >= 7) return 'high';
  if (value >= 4) return 'medium';
  return 'low';
}

function scoreSelectorBindingMatch(
  binding: {
    path: string;
    className: string;
    source: 'resource_chain' | 'name_fallback';
  },
  styleEvidence: { selector: string },
  targetKey: string,
): number {
  let score = 0;
  if (binding.source === 'resource_chain') {
    score += 6;
  }

  const scriptBaseKey = canonicalKey(path.basename(binding.path, '.cs'));
  if (scriptBaseKey === targetKey) {
    score += 4;
  }

  const normalizedSelector = styleEvidence.selector.trim();
  const exactSelector = `.${binding.className}`;
  if (normalizedSelector === exactSelector) {
    score += 2;
  }
  if (normalizedSelector.startsWith(`${exactSelector} `)) {
    score += 1;
  }

  return score;
}
