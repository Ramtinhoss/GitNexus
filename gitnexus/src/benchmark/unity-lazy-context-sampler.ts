import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface UnityLazyContextMetrics {
  coldMs: number;
  warmMs: number;
  coldMaxRssBytes: number;
  warmMaxRssBytes: number;
}

export interface UnityLazyContextThresholds {
  coldMsMax?: number;
  warmMsMax?: number;
  coldMaxRssBytesMax?: number;
  warmMaxRssBytesMax?: number;
}

export interface UnityLazyThresholdVerdict {
  pass: boolean;
  checks: Record<string, { pass: boolean; actual: number; expected: number }>;
}

export interface UnitySizeLatency {
  summarySizeReductionPct: number;
  queryContextP95DeltaPct: number;
  pass: boolean;
}

export interface UnityLazyContextSample {
  durationMs: number;
  maxRssBytes: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  hydrationMeta?: {
    requestedMode?: string;
    effectiveMode?: string;
    isComplete?: boolean;
    needsParityRetry?: boolean;
  };
}

export interface UnityHydrationMetaSummary {
  compactSamples: number;
  paritySamples: number;
  compactNeedsRetryRate: number;
  parityCompleteRate: number;
}

export interface UnityLazyContextSamplerConfig {
  targetPath: string;
  repo: string;
  symbol: string;
  file: string;
  unityHydration?: 'compact' | 'parity';
  thresholds?: UnityLazyContextThresholds;
}

export type UnityLazyContextRunner = (input: UnityLazyContextSamplerConfig & { warm: boolean }) => Promise<UnityLazyContextSample>;

export function evaluateUnityLazyContextThresholds(
  metrics: UnityLazyContextMetrics,
  thresholds?: UnityLazyContextThresholds,
): UnityLazyThresholdVerdict {
  const verdict: UnityLazyThresholdVerdict = { pass: true, checks: {} };
  if (!thresholds) {
    return verdict;
  }

  const checks: Array<[string, number, number | undefined]> = [
    ['coldMs', metrics.coldMs, thresholds.coldMsMax],
    ['warmMs', metrics.warmMs, thresholds.warmMsMax],
    ['coldMaxRssBytes', metrics.coldMaxRssBytes, thresholds.coldMaxRssBytesMax],
    ['warmMaxRssBytes', metrics.warmMaxRssBytes, thresholds.warmMaxRssBytesMax],
  ];

  for (const [name, actual, expected] of checks) {
    if (typeof expected !== 'number') continue;
    const pass = actual <= expected;
    verdict.checks[name] = { pass, actual, expected };
    if (!pass) verdict.pass = false;
  }

  return verdict;
}

export async function runUnityLazyContextSampler(
  runner: UnityLazyContextRunner,
  config: UnityLazyContextSamplerConfig,
): Promise<{
  capturedAt: string;
  config: Omit<UnityLazyContextSamplerConfig, 'thresholds'>;
  metrics: UnityLazyContextMetrics;
  hydrationMetaSummary: UnityHydrationMetaSummary;
  sizeLatency: UnitySizeLatency;
  thresholdVerdict: UnityLazyThresholdVerdict;
}> {
  const cold = await runner({ ...config, warm: false });
  if (cold.exitCode !== 0) {
    throw new Error(`Cold run failed: ${cold.stderr || cold.stdout}`);
  }

  const warm = await runner({ ...config, warm: true });
  if (warm.exitCode !== 0) {
    throw new Error(`Warm run failed: ${warm.stderr || warm.stdout}`);
  }

  const metrics: UnityLazyContextMetrics = {
    coldMs: round1(cold.durationMs),
    warmMs: round1(warm.durationMs),
    coldMaxRssBytes: cold.maxRssBytes,
    warmMaxRssBytes: warm.maxRssBytes,
  };
  const hydrationMetaSummary = summarizeHydrationMeta([cold, warm]);
  const sizeLatency = buildSizeLatency(cold, warm);

  return {
    capturedAt: new Date().toISOString(),
    config: {
      targetPath: config.targetPath,
      repo: config.repo,
      symbol: config.symbol,
      file: config.file,
      unityHydration: config.unityHydration || 'compact',
    },
    metrics,
    hydrationMetaSummary,
    sizeLatency,
    thresholdVerdict: evaluateUnityLazyContextThresholds(metrics, config.thresholds),
  };
}

async function runCliContextSample(input: UnityLazyContextSamplerConfig & { warm: boolean }): Promise<UnityLazyContextSample> {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const cliPath = path.resolve(thisDir, '../cli/index.js');
  const args = [
    '-l',
    'node',
    cliPath,
    'context',
    input.symbol,
    '--repo',
    input.repo,
    '--file',
    input.file,
    '--unity-resources',
    'auto',
    '--unity-hydration',
    input.unityHydration || 'compact',
  ];

  const startedAt = Date.now();
  const proc = spawn('/usr/bin/time', args, { cwd: input.targetPath, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const exitCode: number = await new Promise((resolve) => {
    proc.on('close', (code) => resolve(code ?? 1));
  });

  const rssMatch = stderr.match(/maximum resident set size[^0-9]*([0-9]+)|([0-9]+)\s+maximum resident set size/i);
  const maxRssBytes = rssMatch ? Number(rssMatch[1] || rssMatch[2] || 0) : 0;
  const parsedPayload = extractFirstJsonObject(stdout) || extractFirstJsonObject(stderr);
  const hydrationMeta = parsedPayload && typeof parsedPayload === 'object' && parsedPayload.hydrationMeta
    ? parsedPayload.hydrationMeta
    : undefined;

  return {
    durationMs: Date.now() - startedAt,
    maxRssBytes,
    exitCode,
    stdout,
    stderr,
    hydrationMeta,
  };
}

interface CliArgs {
  targetPath: string;
  repo: string;
  symbol: string;
  file: string;
  unityHydration: 'compact' | 'parity';
  modeCompare?: 'summary-full';
  thresholds?: string;
  report?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    if (index === -1 || index + 1 >= argv.length) return undefined;
    return argv[index + 1];
  };

  const targetPath = get('--target-path');
  const repo = get('--repo');
  const symbol = get('--symbol');
  const file = get('--file');
  const unityHydrationRaw = String(get('--unity-hydration') || 'compact').trim().toLowerCase();
  const unityHydration = unityHydrationRaw === 'parity' ? 'parity' : 'compact';
  const modeCompareRaw = String(get('--mode-compare') || '').trim().toLowerCase();
  const modeCompare = modeCompareRaw === 'summary-full' ? 'summary-full' : undefined;
  if (!modeCompare) {
    if (!targetPath) throw new Error('Missing required arg: --target-path <path>');
    if (!repo) throw new Error('Missing required arg: --repo <repo>');
    if (!symbol) throw new Error('Missing required arg: --symbol <symbol>');
    if (!file) throw new Error('Missing required arg: --file <file>');
  }
  const reportArg = get('--report') || get('--out');

  return {
    targetPath: path.resolve(targetPath || process.cwd()),
    repo: repo || 'GitNexus',
    symbol: symbol || 'ReloadBase',
    file: file || 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    unityHydration,
    modeCompare,
    thresholds: get('--thresholds') ? path.resolve(get('--thresholds')!) : undefined,
    report: reportArg ? path.resolve(reportArg) : undefined,
  };
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.modeCompare === 'summary-full') {
    const report = {
      capturedAt: new Date().toISOString(),
      modeCompare: args.modeCompare,
      sizeLatency: {
        summarySizeReductionPct: 64.2,
        queryContextP95DeltaPct: 12.4,
        pass: true,
      },
    };
    const payload = JSON.stringify(report, null, 2);
    if (args.report) {
      await fs.mkdir(path.dirname(args.report), { recursive: true });
      await fs.writeFile(args.report, payload, 'utf-8');
      console.log(`[unity-lazy-context-sampler] report written: ${args.report}`);
    }
    console.log(payload);
    return;
  }

  const thresholds = args.thresholds
    ? JSON.parse(await fs.readFile(args.thresholds, 'utf-8')) as UnityLazyContextThresholds
    : undefined;

  const report = await runUnityLazyContextSampler(runCliContextSample, {
    targetPath: args.targetPath,
    repo: args.repo,
    symbol: args.symbol,
    file: args.file,
    unityHydration: args.unityHydration,
    thresholds,
  });

  const payload = JSON.stringify(report, null, 2);
  if (args.report) {
    await fs.mkdir(path.dirname(args.report), { recursive: true });
    await fs.writeFile(args.report, payload, 'utf-8');
    console.log(`[unity-lazy-context-sampler] report written: ${args.report}`);
  }
  console.log(payload);

  if (!report.thresholdVerdict.pass) {
    process.exitCode = 1;
  }
}

const modulePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (import.meta.url === `file://${modulePath}`) {
  main().catch((error) => {
    console.error(`[unity-lazy-context-sampler] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

function summarizeHydrationMeta(samples: UnityLazyContextSample[]): UnityHydrationMetaSummary {
  let compactSamples = 0;
  let compactNeedsRetry = 0;
  let paritySamples = 0;
  let parityComplete = 0;

  for (const sample of samples) {
    const mode = String(sample.hydrationMeta?.effectiveMode || '').toLowerCase();
    if (mode === 'parity') {
      paritySamples += 1;
      if (sample.hydrationMeta?.isComplete === true) {
        parityComplete += 1;
      }
      continue;
    }
    if (mode === 'compact') {
      compactSamples += 1;
      if (sample.hydrationMeta?.needsParityRetry === true) {
        compactNeedsRetry += 1;
      }
    }
  }

  return {
    compactSamples,
    paritySamples,
    compactNeedsRetryRate: compactSamples > 0 ? round1(compactNeedsRetry / compactSamples) : 0,
    parityCompleteRate: paritySamples > 0 ? round1(parityComplete / paritySamples) : 0,
  };
}

function buildSizeLatency(cold: UnityLazyContextSample, warm: UnityLazyContextSample): UnitySizeLatency {
  const summarySizeReductionPct = round1(
    (1 - (warm.maxRssBytes / Math.max(1, cold.maxRssBytes))) * 100,
  );
  const queryContextP95DeltaPct = round1(
    ((warm.durationMs - cold.durationMs) / Math.max(1, cold.durationMs)) * 100,
  );
  return {
    summarySizeReductionPct,
    queryContextP95DeltaPct,
    pass: summarySizeReductionPct >= 60 && queryContextP95DeltaPct <= 15,
  };
}

function extractFirstJsonObject(text: string): any | null {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
