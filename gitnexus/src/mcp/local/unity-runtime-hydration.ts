import { buildUnityScanContext, buildUnityScanContextFromSeed } from '../../core/unity/scan-context.js';
import { resolveUnityBindings, type ResolvedUnityBinding } from '../../core/unity/resolver.js';
import type { UnityHydrationMode } from '../../core/unity/options.js';
import {
  formatLazyHydrationBudgetDiagnostic,
  type UnityContextPayload,
  type UnityHydrationMeta,
} from './unity-enrichment.js';
import { resolveUnityLazyConfig } from './unity-lazy-config.js';
import { hydrateLazyBindings, type HydrateLazyBindingsInput } from './unity-lazy-hydrator.js';
import { readUnityOverlayBindings, upsertUnityOverlayBindings } from './unity-lazy-overlay.js';
import { readUnityParityCache, upsertUnityParityCache } from './unity-parity-cache.js';
import { createParityWarmupQueue, type ParityWarmupQueue } from './unity-parity-warmup-queue.js';
import { loadUnityParitySeed } from './unity-parity-seed-loader.js';

export interface HydrationDeps {
  executeQuery: (query: string, params?: Record<string, unknown>) => Promise<any[]>;
  repoPath: string;
  storagePath: string;
  indexedCommit: string;
}

export interface HydrateUnityInput {
  mode: UnityHydrationMode;
  basePayload: UnityContextPayload;
  deps: HydrationDeps;
  symbol: {
    uid: string;
    name: string;
    filePath: string;
  };
  runtime?: Partial<HydrationRuntime>;
}

interface HydrationRuntime {
  now: () => number;
  queue: ParityWarmupQueue;
  resolveLazyConfig: typeof resolveUnityLazyConfig;
  hydrateLazyBindings: (input: HydrateLazyBindingsInput) => ReturnType<typeof hydrateLazyBindings>;
  readOverlayBindings: typeof readUnityOverlayBindings;
  upsertOverlayBindings: typeof upsertUnityOverlayBindings;
  readParityCache: typeof readUnityParityCache;
  upsertParityCache: typeof upsertUnityParityCache;
  loadParitySeed: typeof loadUnityParitySeed;
  buildScanContext: typeof buildUnityScanContext;
  buildScanContextFromSeed: typeof buildUnityScanContextFromSeed;
  resolveBindings: typeof resolveUnityBindings;
  shouldEnableWarmup: (env: NodeJS.ProcessEnv) => boolean;
}

const inFlightParityHydration = new Map<string, Promise<UnityContextPayload>>();
const parityWarmupQueue = createParityWarmupQueue({
  maxParallel: resolveParityWarmupMaxParallel(process.env),
});

function resolveParityWarmupMaxParallel(env: NodeJS.ProcessEnv): number {
  const raw = String(env.GITNEXUS_UNITY_PARITY_WARMUP_MAX_PARALLEL || '').trim();
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 2;
}

function normalizePath(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/');
}

function bindingIdentity(binding: ResolvedUnityBinding): string {
  return [
    normalizePath(binding.resourcePath),
    binding.bindingKind,
    binding.componentObjectId,
  ].join('|');
}

export function mergeUnityBindings(
  baseBindings: ResolvedUnityBinding[],
  resolvedByPath: Map<string, ResolvedUnityBinding[]>,
): ResolvedUnityBinding[] {
  const merged: ResolvedUnityBinding[] = [];
  const expandedPaths = new Set<string>();

  for (const binding of baseBindings) {
    const resourcePath = normalizePath(binding.resourcePath);
    if (!binding.lightweight) {
      merged.push(binding);
      continue;
    }

    const expanded = resolvedByPath.get(resourcePath);
    if (expanded && expanded.length > 0) {
      if (!expandedPaths.has(resourcePath)) {
        merged.push(...expanded.map((row) => ({ ...row, lightweight: false })));
        expandedPaths.add(resourcePath);
      }
      continue;
    }

    merged.push(binding);
  }

  return merged;
}

export function mergeParityUnityBindings(
  baseNonLightweightBindings: ResolvedUnityBinding[],
  resolvedBindings: ResolvedUnityBinding[],
): ResolvedUnityBinding[] {
  const merged: ResolvedUnityBinding[] = [];
  const seen = new Set<string>();
  for (const row of [...baseNonLightweightBindings, ...resolvedBindings]) {
    const key = bindingIdentity(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...row, lightweight: false });
  }
  return merged;
}

export function attachUnityHydrationMeta(
  payload: UnityContextPayload,
  input: Pick<UnityHydrationMeta, 'requestedMode' | 'effectiveMode' | 'elapsedMs' | 'fallbackToCompact'> & {
    hasExpandableBindings: boolean;
  },
): UnityContextPayload {
  const { hasExpandableBindings, ...metaInput } = input;
  const reasons: string[] = [];
  if (metaInput.effectiveMode === 'compact' && hasExpandableBindings) {
    reasons.push('mode_compact');
  }
  if (metaInput.fallbackToCompact) {
    reasons.push('fallback_to_compact');
  }
  if (hasExpandableBindings) {
    reasons.push('lightweight_bindings_remaining');
  }
  if ((payload.unityDiagnostics || []).some((diag) => /budget exceeded/i.test(String(diag || '')))) {
    reasons.push('budget_exceeded');
  }
  const isComplete = reasons.length === 0;
  const needsParityRetry = !isComplete && metaInput.effectiveMode === 'compact';

  return {
    ...payload,
    hydrationMeta: {
      ...metaInput,
      resourceBindingCount: payload.resourceBindings.length,
      unityDiagnosticsCount: payload.unityDiagnostics.length,
      isComplete,
      completenessReason: reasons,
      needsParityRetry,
      ...(needsParityRetry ? { retryHint: 'rerun_with_unity_hydration=parity' } : {}),
    },
  };
}

export async function hydrateUnityForSymbol(input: HydrateUnityInput): Promise<UnityContextPayload> {
  const runtime = resolveRuntime(input.runtime);
  const startedAt = runtime.now();

  if (input.mode === 'compact') {
    const compactPayload = await runCompactHydration(input, runtime);
    const withMeta = attachUnityHydrationMeta(compactPayload, {
      requestedMode: 'compact',
      effectiveMode: 'compact',
      elapsedMs: runtime.now() - startedAt,
      fallbackToCompact: false,
      hasExpandableBindings: hasExpandableBindings(compactPayload),
    });
    if (withMeta.hydrationMeta?.needsParityRetry) {
      scheduleParityWarmup(input, runtime);
    }
    return withMeta;
  }

  const parityResult = await runParityHydrationWithFallback(input, runtime);
  return attachUnityHydrationMeta(parityResult.payload, {
    requestedMode: 'parity',
    effectiveMode: parityResult.effectiveMode,
    elapsedMs: runtime.now() - startedAt,
    fallbackToCompact: parityResult.fallbackToCompact,
    hasExpandableBindings: hasExpandableBindings(parityResult.payload),
  });
}

function resolveRuntime(overrides?: Partial<HydrationRuntime>): HydrationRuntime {
  return {
    now: () => Date.now(),
    queue: parityWarmupQueue,
    resolveLazyConfig: resolveUnityLazyConfig,
    hydrateLazyBindings,
    readOverlayBindings: readUnityOverlayBindings,
    upsertOverlayBindings: upsertUnityOverlayBindings,
    readParityCache: readUnityParityCache,
    upsertParityCache: upsertUnityParityCache,
    loadParitySeed: loadUnityParitySeed,
    buildScanContext: buildUnityScanContext,
    buildScanContextFromSeed: buildUnityScanContextFromSeed,
    resolveBindings: resolveUnityBindings,
    shouldEnableWarmup,
    ...overrides,
  };
}

function hasExpandableBindings(payload: UnityContextPayload): boolean {
  return payload.resourceBindings.some(
    (binding) => binding.lightweight || binding.componentObjectId === 'summary',
  );
}

function buildParityWarmupKey(input: HydrateUnityInput): string {
  return `${input.deps.storagePath}::${input.deps.indexedCommit}::${input.symbol.uid}`;
}

function scheduleParityWarmup(input: HydrateUnityInput, runtime: HydrationRuntime): void {
  if (!runtime.shouldEnableWarmup(process.env)) {
    return;
  }
  if (!input.symbol.uid || !input.symbol.name || !input.symbol.filePath) {
    return;
  }

  void runtime.queue.run(() => getOrRunParityHydration(input, runtime))
    .then(() => undefined)
    .catch(() => undefined);
}

function shouldEnableWarmup(env: NodeJS.ProcessEnv): boolean {
  const raw = String(env.GITNEXUS_UNITY_PARITY_WARMUP || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

async function getOrRunParityHydration(
  input: HydrateUnityInput,
  runtime: HydrationRuntime,
): Promise<UnityContextPayload> {
  const key = buildParityWarmupKey(input);
  const existing = inFlightParityHydration.get(key);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const cached = await runtime.readParityCache(
      input.deps.storagePath,
      input.deps.indexedCommit,
      input.symbol.uid,
    );
    if (cached) {
      return cached;
    }

    const payload = await computeParityPayload(input, runtime);
    await runtime.upsertParityCache(
      input.deps.storagePath,
      input.deps.indexedCommit,
      input.symbol.uid,
      payload,
    );
    return payload;
  })().finally(() => {
    inFlightParityHydration.delete(key);
  });

  inFlightParityHydration.set(key, pending);
  return pending;
}

async function computeParityPayload(
  input: HydrateUnityInput,
  runtime: HydrationRuntime,
): Promise<UnityContextPayload> {
  const symbolDeclarations = [{ symbol: input.symbol.name, scriptPath: input.symbol.filePath }];
  const paritySeed = await runtime.loadParitySeed(input.deps.storagePath, {
    indexedCommit: input.deps.indexedCommit,
  });

  const seededScanContext = paritySeed
    ? runtime.buildScanContextFromSeed({ seed: paritySeed, symbolDeclarations })
    : null;

  let resolved = await runtime.resolveBindings({
    repoRoot: input.deps.repoPath,
    symbol: input.symbol.name,
    scanContext: seededScanContext || await runtime.buildScanContext({
      repoRoot: input.deps.repoPath,
      symbolDeclarations,
    }),
    deepParseLargeResources: true,
  });

  if (seededScanContext && resolved.resourceBindings.length === 0 && input.basePayload.resourceBindings.length > 0) {
    const fallbackScanContext = await runtime.buildScanContext({
      repoRoot: input.deps.repoPath,
      symbolDeclarations,
    });
    resolved = await runtime.resolveBindings({
      repoRoot: input.deps.repoPath,
      symbol: input.symbol.name,
      scanContext: fallbackScanContext,
      deepParseLargeResources: true,
    });
  }

  if (resolved.resourceBindings.length === 0 && input.basePayload.resourceBindings.length > 0) {
    throw new Error('parity-expand returned zero bindings');
  }

  const baseNonLightweight = input.basePayload.resourceBindings.filter(
    (binding) => !binding.lightweight && binding.componentObjectId !== 'summary',
  );
  const mergedBindings = mergeParityUnityBindings(baseNonLightweight, resolved.resourceBindings);
  return toUnityContextPayload(mergedBindings, [
    ...input.basePayload.unityDiagnostics,
    ...resolved.unityDiagnostics,
  ]);
}

async function runParityHydrationWithFallback(
  input: HydrateUnityInput,
  runtime: HydrationRuntime,
): Promise<{ payload: UnityContextPayload; effectiveMode: UnityHydrationMode; fallbackToCompact: boolean }> {
  try {
    return {
      payload: await getOrRunParityHydration(input, runtime),
      effectiveMode: 'parity',
      fallbackToCompact: false,
    };
  } catch (error) {
    const compactFallback = await runCompactHydration(input, runtime);
    const message = String(error instanceof Error ? error.message : error);
    return {
      payload: {
        ...compactFallback,
        unityDiagnostics: [
          ...compactFallback.unityDiagnostics,
          /parity-expand returned zero bindings/i.test(message)
            ? 'parity-expand returned zero bindings; fell back to compact hydration'
            : `parity-expand failed: ${message}`,
        ],
      },
      effectiveMode: 'compact',
      fallbackToCompact: true,
    };
  }
}

async function runCompactHydration(
  input: HydrateUnityInput,
  runtime: HydrationRuntime,
): Promise<UnityContextPayload> {
  const lightweightPaths = [...new Set(
    input.basePayload.resourceBindings
      .filter((binding) => binding.lightweight || binding.componentObjectId === 'summary')
      .map((binding) => normalizePath(binding.resourcePath))
      .filter((value) => value.length > 0),
  )];

  if (lightweightPaths.length === 0) {
    return input.basePayload;
  }

  const overlayHits = await runtime.readOverlayBindings(
    input.deps.storagePath,
    input.deps.indexedCommit,
    input.symbol.uid,
    lightweightPaths,
  );
  const pendingPaths = lightweightPaths.filter((resourcePath) => !overlayHits.has(resourcePath));
  const resolvedByPath = new Map<string, ResolvedUnityBinding[]>(overlayHits);
  const unityDiagnostics = [...input.basePayload.unityDiagnostics];

  if (pendingPaths.length > 0) {
    try {
      const cfg = runtime.resolveLazyConfig(process.env);
      const hydration = await runtime.hydrateLazyBindings({
        pendingPaths,
        config: cfg,
        dedupeKey: `${input.symbol.uid}::${pendingPaths.slice().sort().join('|')}`,
        resolveBatch: async (resourcePaths) => {
          const scopedPaths = [
            input.symbol.filePath,
            `${input.symbol.filePath}.meta`,
            ...resourcePaths,
            ...resourcePaths.map((resourcePath) => `${resourcePath}.meta`),
          ].map(normalizePath);

          const scanContext = await runtime.buildScanContext({
            repoRoot: input.deps.repoPath,
            scopedPaths,
            symbolDeclarations: [{ symbol: input.symbol.name, scriptPath: input.symbol.filePath }],
          });

          const resolved = await runtime.resolveBindings({
            repoRoot: input.deps.repoPath,
            symbol: input.symbol.name,
            scanContext,
            resourcePathAllowlist: resourcePaths,
            deepParseLargeResources: true,
          });

          unityDiagnostics.push(...resolved.unityDiagnostics);
          const byPath = new Map<string, ResolvedUnityBinding[]>();
          for (const resourcePath of resourcePaths) {
            byPath.set(resourcePath, resolved.resourceBindings.filter(
              (binding) => normalizePath(binding.resourcePath) === normalizePath(resourcePath),
            ));
          }
          return byPath;
        },
      });

      const freshByPath = hydration.resolvedByPath;
      if (hydration.timedOut) {
        unityDiagnostics.push(formatLazyHydrationBudgetDiagnostic(hydration.elapsedMs));
      }
      const hydrationExtras = hydration.diagnostics.filter((diag) => !/budget exceeded/i.test(diag));
      if (hydrationExtras.length > 0) {
        unityDiagnostics.push(...hydrationExtras);
      }

      await runtime.upsertOverlayBindings(
        input.deps.storagePath,
        input.deps.indexedCommit,
        input.symbol.uid,
        freshByPath,
      );
      for (const [resourcePath, bindings] of freshByPath.entries()) {
        resolvedByPath.set(resourcePath, bindings);
      }
    } catch (error) {
      unityDiagnostics.push(`lazy-expand failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const mergedBindings = mergeUnityBindings(input.basePayload.resourceBindings, resolvedByPath);
  return toUnityContextPayload(mergedBindings, unityDiagnostics);
}

function toUnityContextPayload(
  resourceBindings: ResolvedUnityBinding[],
  unityDiagnostics: string[],
): UnityContextPayload {
  return {
    resourceBindings,
    serializedFields: {
      scalarFields: resourceBindings.flatMap((binding) => binding.serializedFields.scalarFields),
      referenceFields: resourceBindings.flatMap((binding) => binding.serializedFields.referenceFields),
    },
    unityDiagnostics: [...new Set(unityDiagnostics)],
  };
}

export function __resetUnityRuntimeHydrationStateForTest(): void {
  inFlightParityHydration.clear();
}
