import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalBackend } from '../../mcp/local/local-backend.js';
import { resolveUnityConfig } from '../../core/config/unity-config.js';

type PolicyName = 'fast' | 'balanced' | 'strict';

interface PolicyRunSnapshot {
  status: string;
  evidence_level: string;
  reason?: string;
  fallbackToCompact: boolean;
}

interface PolicyModeObservation {
  requestedMode?: string;
  effectiveMode?: string;
  reason?: string;
  needsParityRetry?: boolean;
}

function observeHydrationMeta(out: any): PolicyModeObservation {
  if (out?.hydrationMeta) {
    return {
      requestedMode: out.hydrationMeta.requestedMode,
      effectiveMode: out.hydrationMeta.effectiveMode,
      reason: out.hydrationMeta.reason,
      needsParityRetry: out.hydrationMeta.needsParityRetry,
    };
  }
  return {
    reason: out?.error
      ? `missing_hydration_meta:${String(out.error)}`
      : 'missing_hydration_meta:no_hydration_payload',
  };
}

export interface HydrationPolicyRepeatabilityReport {
  generatedAt: string;
  repoAlias: string;
  repeatability: Record<PolicyName, { consistent: boolean; runCount: number; mismatchCount: number }>;
  policy_mode_matrix: Record<PolicyName, { compact: PolicyModeObservation; parity: PolicyModeObservation }>;
  policy_mapping: {
    fast: { requested: string; effective: string; reason?: string };
    balanced: { compact_requested: string; parity_requested: string; escalation?: string };
    strict: { requested: string; effective: string; reason?: string; downgradeOnFallback: 'verified_partial/verified_segment' };
  };
  missing_evidence_contract: { requiresArray: boolean; populatedWhenIncomplete: boolean };
  contractCompatibility: { needsParityRetryRetained: boolean };
  warmup_cache_state: { parityWarmupEnabled: boolean; note: string };
}

function snapshotFromResponse(out: any): PolicyRunSnapshot {
  return {
    status: String(out?.runtime_claim?.status || 'unknown'),
    evidence_level: String(out?.runtime_claim?.evidence_level || 'none'),
    reason: out?.runtime_claim?.reason ? String(out.runtime_claim.reason) : undefined,
    fallbackToCompact: Boolean(out?.hydrationMeta?.fallbackToCompact),
  };
}

async function callPolicyProbe(input: {
  backend: LocalBackend;
  repoAlias: string;
  policy: PolicyName;
  mode: 'compact' | 'parity';
}): Promise<any> {
  const queryOut = await input.backend.callTool('query', {
    repo: input.repoAlias,
    query: 'Reload',
    unity_resources: 'on',
    hydration_policy: input.policy,
    unity_hydration_mode: input.mode,
    runtime_chain_verify: 'on-demand',
  });
  if (queryOut?.hydrationMeta) {
    return queryOut;
  }

  return input.backend.callTool('context', {
    repo: input.repoAlias,
    name: 'ReloadBase',
    file_path: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    unity_resources: 'on',
    hydration_policy: input.policy,
    unity_hydration_mode: input.mode,
    runtime_chain_verify: 'on-demand',
  });
}

function classifyConsistency(rows: PolicyRunSnapshot[]): { consistent: boolean; mismatchCount: number } {
  if (rows.length <= 1) return { consistent: true, mismatchCount: 0 };
  const first = JSON.stringify(rows[0]);
  let mismatchCount = 0;
  for (let i = 1; i < rows.length; i += 1) {
    if (JSON.stringify(rows[i]) !== first) mismatchCount += 1;
  }
  return { consistent: mismatchCount === 0, mismatchCount };
}

export async function buildHydrationPolicyRepeatabilityReport(input: {
  repoAlias: string;
  runCount?: number;
}): Promise<HydrationPolicyRepeatabilityReport> {
  const backend = new LocalBackend();
  const ready = await backend.init();
  if (!ready) {
    throw new Error('LocalBackend failed to initialize for hydration policy repeatability runner');
  }

  const runCount = Math.max(1, Number(input.runCount || 3));
  const policies: PolicyName[] = ['fast', 'balanced', 'strict'];
  const snapshotsByPolicy = new Map<PolicyName, PolicyRunSnapshot[]>();
  let requiresArray = true;
  let populatedWhenIncomplete = true;
  let needsParityRetryRetained = true;

  for (const policy of policies) {
    const snapshots: PolicyRunSnapshot[] = [];
    for (let i = 0; i < runCount; i += 1) {
      const out = await callPolicyProbe({
        backend,
        repoAlias: input.repoAlias,
        policy,
        mode: 'compact',
      });
      snapshots.push(snapshotFromResponse(out));

      const missingEvidence = out?.missing_evidence;
      if (missingEvidence !== undefined && !Array.isArray(missingEvidence)) {
        requiresArray = false;
      }
      if (out?.hydrationMeta?.isComplete === false && (!Array.isArray(missingEvidence) || missingEvidence.length === 0)) {
        populatedWhenIncomplete = false;
      }
      if (out?.hydrationMeta?.effectiveMode === 'compact' && out?.hydrationMeta?.isComplete === false) {
        if (typeof out?.hydrationMeta?.needsParityRetry !== 'boolean') {
          needsParityRetryRetained = false;
        }
      }
    }
    snapshotsByPolicy.set(policy, snapshots);
  }

  const fastConsistency = classifyConsistency(snapshotsByPolicy.get('fast') || []);
  const balancedConsistency = classifyConsistency(snapshotsByPolicy.get('balanced') || []);
  const strictConsistency = classifyConsistency(snapshotsByPolicy.get('strict') || []);
  const strictRows = snapshotsByPolicy.get('strict') || [];
  const strictFallbackDowngraded = strictRows.every((row) => {
    if (!row.fallbackToCompact) return true;
    return row.status === 'verified_partial' && row.evidence_level === 'verified_segment';
  });

  const policy_mode_matrix = {} as Record<PolicyName, { compact: PolicyModeObservation; parity: PolicyModeObservation }>;
  for (const policy of policies) {
    const compactOut = await callPolicyProbe({
      backend,
      repoAlias: input.repoAlias,
      policy,
      mode: 'compact',
    });
    const parityOut = await callPolicyProbe({
      backend,
      repoAlias: input.repoAlias,
      policy,
      mode: 'parity',
    });
    policy_mode_matrix[policy] = {
      compact: observeHydrationMeta(compactOut),
      parity: observeHydrationMeta(parityOut),
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    repoAlias: input.repoAlias,
    repeatability: {
      fast: { consistent: fastConsistency.consistent, runCount, mismatchCount: fastConsistency.mismatchCount },
      balanced: { consistent: balancedConsistency.consistent, runCount, mismatchCount: balancedConsistency.mismatchCount },
      strict: { consistent: strictConsistency.consistent && strictFallbackDowngraded, runCount, mismatchCount: strictConsistency.mismatchCount },
    },
    policy_mode_matrix,
    policy_mapping: {
      fast: {
        requested: policy_mode_matrix.fast.compact.requestedMode || 'compact',
        effective: policy_mode_matrix.fast.compact.effectiveMode || 'compact',
        reason: policy_mode_matrix.fast.compact.reason,
      },
      balanced: {
        compact_requested: policy_mode_matrix.balanced.compact.requestedMode || 'compact',
        parity_requested: policy_mode_matrix.balanced.parity.requestedMode || 'compact',
        escalation: 'parity_on_missing_evidence',
      },
      strict: {
        requested: policy_mode_matrix.strict.compact.requestedMode || 'parity',
        effective: policy_mode_matrix.strict.compact.effectiveMode || 'parity',
        reason: policy_mode_matrix.strict.compact.reason,
        downgradeOnFallback: 'verified_partial/verified_segment',
      },
    },
    missing_evidence_contract: {
      requiresArray,
      populatedWhenIncomplete,
    },
    contractCompatibility: {
      needsParityRetryRetained,
    },
    warmup_cache_state: {
      parityWarmupEnabled: resolveUnityConfig().config.parityWarmup,
      note: 'repeatability sampled under current runtime/cache state',
    },
  };
}

export async function writeHydrationPolicyRepeatabilityReport(
  outPath: string,
  report: HydrationPolicyRepeatabilityReport,
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));
}

async function main(argv: string[]): Promise<void> {
  const repoIndex = argv.indexOf('--repo');
  const outIndex = argv.indexOf('--out');
  const repoAlias = String(argv[repoIndex + 1] || '').trim();
  const outPath = path.resolve(String(argv[outIndex + 1] || '').trim());
  if (!repoAlias || !outPath) {
    throw new Error('Usage: node dist/benchmark/u2-e2e/hydration-policy-repeatability-runner.js --repo <alias> --out <path>');
  }
  const report = await buildHydrationPolicyRepeatabilityReport({ repoAlias, runCount: 3 });
  await writeHydrationPolicyRepeatabilityReport(outPath, report);
  process.stdout.write(`phase4 hydration policy repeatability artifact written: ${outPath}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (entryPath === thisPath) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
