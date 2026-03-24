import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { scanUiAssetRefs } from './ui-asset-ref-scanner.js';
import { parseUxmlRefs } from './uxml-ref-parser.js';
import { parseUssSelectors } from './uss-selector-parser.js';
import { extractCsharpSelectorBindings } from './csharp-selector-binding.js';
import { buildUnityUiMetaIndex } from './ui-meta-index.js';

export type UnityUiTraceGoal = 'asset_refs' | 'template_refs' | 'selector_bindings';

export interface UnityUiTraceEvidenceHop {
  path: string;
  line: number;
  snippet: string;
}

export interface UnityUiTraceResult {
  key: string;
  evidence_chain: UnityUiTraceEvidenceHop[];
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
}

export async function runUnityUiTrace(input: UnityUiTraceInput): Promise<UnityUiTraceOutput> {
  const target = String(input.target || '').trim();
  const goal = input.goal;
  const key = canonicalKey(target);
  const uiMeta = await buildUnityUiMetaIndex(input.repoRoot);

  const uxmlCandidates = resolveTargetUxmlCandidates(target, key, uiMeta.uxmlGuidToPath);
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

  if (results.length > 1) {
    diagnostics.push({
      code: 'ambiguous',
      message: 'Multiple candidates found; unique-result policy rejected output.',
      candidates: results.map((result) => result.evidence_chain[0]).filter(Boolean),
    });
    return { goal, target, results: [], diagnostics };
  }

  return { goal, target, results, diagnostics };
}

async function resolveGoal(input: {
  repoRoot: string;
  goal: UnityUiTraceGoal;
  target: string;
  targetKey: string;
  targetUxmlPath: string;
  uiMeta: Awaited<ReturnType<typeof buildUnityUiMetaIndex>>;
}): Promise<UnityUiTraceResult[]> {
  if (input.goal === 'asset_refs') {
    const refs = await scanUiAssetRefs({ repoRoot: input.repoRoot });
    return refs
      .filter((row) => input.uiMeta.uxmlGuidToPath.get(row.guid) === input.targetUxmlPath)
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

  const csharpBindings = await scanCsharpBindings(input.repoRoot, input.targetKey);
  const styles = await resolveStyleSelectorsForUxml(input.repoRoot, input.targetUxmlPath, input.uiMeta);
  const styleSelectorIndex = new Map(styles.map((entry) => [entry.selector, entry] as const));
  const selectorMatches: UnityUiTraceResult[] = [];

  for (const binding of csharpBindings) {
    const selectorKey = `.${binding.className}`;
    const styleEvidence = styleSelectorIndex.get(selectorKey);
    if (!styleEvidence) continue;
    selectorMatches.push({
      key: `${binding.path}:${binding.line}:${selectorKey}`,
      evidence_chain: [
        { path: binding.path, line: binding.line, snippet: binding.snippet },
        { path: styleEvidence.path, line: styleEvidence.line, snippet: styleEvidence.snippet },
      ],
    });
  }

  return selectorMatches;
}

function resolveTargetUxmlCandidates(target: string, targetKey: string, uxmlGuidToPath: Map<string, string>): string[] {
  const set = new Set<string>();
  const normalizedTarget = target.replace(/\\/g, '/');
  if (normalizedTarget.endsWith('.uxml')) {
    set.add(normalizedTarget);
  }
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

async function scanCsharpBindings(repoRoot: string, targetKey: string): Promise<Array<{
  path: string;
  line: number;
  snippet: string;
  className: string;
}>> {
  const scriptPaths = (await glob('**/*.cs', { cwd: repoRoot, nodir: true, dot: false }))
    .sort((left, right) => left.localeCompare(right))
    .filter((scriptPath) => canonicalKey(path.basename(scriptPath, '.cs')) === targetKey);

  const out: Array<{ path: string; line: number; snippet: string; className: string }> = [];
  for (const scriptPath of scriptPaths) {
    const source = await safeRead(path.join(repoRoot, scriptPath));
    const bindings = extractCsharpSelectorBindings(source);
    for (const binding of bindings) {
      out.push({
        path: scriptPath.replace(/\\/g, '/'),
        line: binding.line,
        snippet: binding.snippet,
        className: binding.className,
      });
    }
  }
  return out;
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
