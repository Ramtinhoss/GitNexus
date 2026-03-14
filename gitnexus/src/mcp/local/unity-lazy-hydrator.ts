import type { ResolvedUnityBinding } from '../../core/unity/resolver.js';
import type { UnityLazyConfig } from './unity-lazy-config.js';

export interface HydrateLazyBindingsInput {
  pendingPaths: string[];
  config: UnityLazyConfig;
  resolveBatch: (paths: string[]) => Promise<Map<string, ResolvedUnityBinding[]>>;
}

export interface HydrateLazyBindingsOutput {
  resolvedByPath: Map<string, ResolvedUnityBinding[]>;
  timedOut: boolean;
  elapsedMs: number;
}

export async function hydrateLazyBindings(input: HydrateLazyBindingsInput): Promise<HydrateLazyBindingsOutput> {
  const pending = input.pendingPaths.slice(0, Math.max(0, input.config.maxPendingPathsPerRequest));
  const batchSize = Math.max(1, input.config.batchSize);
  const startedAt = Date.now();
  const resolvedByPath = new Map<string, ResolvedUnityBinding[]>();
  let timedOut = false;

  for (let i = 0; i < pending.length; i += batchSize) {
    if (Date.now() - startedAt > input.config.maxHydrationMs) {
      timedOut = true;
      break;
    }

    const chunk = pending.slice(i, i + batchSize);
    const resolved = await input.resolveBatch(chunk);
    for (const [resourcePath, bindings] of resolved.entries()) {
      resolvedByPath.set(resourcePath, bindings);
    }
  }

  return {
    resolvedByPath,
    timedOut,
    elapsedMs: Date.now() - startedAt,
  };
}
