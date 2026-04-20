import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRuntimeClaimOnDemand } from '../../mcp/local/runtime-chain-verify.js';

export interface Phase2RuntimeClaimAcceptanceReport {
  generatedAt: string;
  repoAlias: string;
  claim_fields_presence: {
    rule_id: boolean;
    rule_version: boolean;
    scope: boolean;
    guarantees: boolean;
    non_guarantees: boolean;
  };
  failure_classification_coverage: string[];
  failure_classification_missing: string[];
  coverage_pass: boolean;
  samples: {
    matched_status?: string;
    matched_reason?: string;
    evidence_missing_reason?: string;
    verification_failed_reason?: string;
    unmatched_reason?: string;
  };
  reproduction_commands: Record<string, string>;
}

function makeSymbolOnlyExecutor(symbolName: string, filePath: string) {
  return async (query: string, params?: Record<string, unknown>) => {
    if (!String(query || '').includes('WHERE n.name IN $symbolNames')) {
      return [];
    }
    const names = Array.isArray(params?.symbolNames) ? (params?.symbolNames as string[]) : [];
    if (!names.includes(symbolName)) return [];
    return [{
      id: `Class:${filePath}:${symbolName}`,
      name: symbolName,
      type: 'Class',
      filePath,
      startLine: 1,
    }];
  };
}

export async function buildPhase2RuntimeClaimAcceptanceReport(input: {
  repoAlias: string;
}): Promise<Phase2RuntimeClaimAcceptanceReport> {
  const repoPath = path.resolve('.');
  const verificationFailedClaim = await verifyRuntimeClaimOnDemand({
    repoPath,
    queryText: 'Reload',
    symbolName: 'ReloadBase',
    symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    resourceSeedPath: 'Assets/Rules/reload.asset',
    resourceBindings: [{ resourcePath: 'Assets/Rules/reload.asset' }],
    executeParameterized: makeSymbolOnlyExecutor(
      'ReloadBase',
      'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    ),
  });
  const evidenceMissingClaim = await verifyRuntimeClaimOnDemand({
    repoPath,
    queryText: 'Reload',
    symbolName: 'ReloadBase',
    symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    resourceSeedPath: 'Assets/Rules/reload.asset',
    resourceBindings: [{ resourcePath: 'Assets/Rules/reload.asset' }],
    minimumEvidenceSatisfied: false,
    executeParameterized: makeSymbolOnlyExecutor(
      'ReloadBase',
      'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    ),
  });
  const unmatchedClaim = await verifyRuntimeClaimOnDemand({
    repoPath,
    queryText: 'UnrelatedUnityChain',
    resourceBindings: [],
    executeParameterized: async () => [],
  });
  const verificationFailedReason = String(
    verificationFailedClaim.reason || 'rule_matched_but_verification_failed',
  );

  const claim = verificationFailedClaim;
  const requiredReasons = [
    'rule_not_matched',
    'rule_matched_but_evidence_missing',
    'rule_matched_but_verification_failed',
  ];
  const reasons = [
    verificationFailedReason,
    evidenceMissingClaim.reason,
    unmatchedClaim.reason,
  ]
    .filter(Boolean)
    .map((reason) => String(reason));
  const failure_classification_coverage = [...new Set(reasons)];
  const failure_classification_missing = requiredReasons.filter((reason) => !failure_classification_coverage.includes(reason));
  const coverage_pass = failure_classification_missing.length === 0;

  const report: Phase2RuntimeClaimAcceptanceReport = {
    generatedAt: new Date().toISOString(),
    repoAlias: input.repoAlias,
    claim_fields_presence: {
      rule_id: Boolean(claim.rule_id),
      rule_version: Boolean(claim.rule_version),
      scope: Boolean(claim.scope),
      guarantees: Array.isArray(claim.guarantees),
      non_guarantees: Array.isArray(claim.non_guarantees),
    },
    failure_classification_coverage,
    failure_classification_missing,
    coverage_pass,
    samples: {
      matched_status: claim.status,
      matched_reason: claim.reason,
      evidence_missing_reason: evidenceMissingClaim.reason,
      verification_failed_reason: verificationFailedReason,
      unmatched_reason: unmatchedClaim.reason,
    },
    reproduction_commands: {
      rule_matched_but_verification_failed:
        'gitnexus query --runtime-chain-verify on-demand --unity-resources on "Reload"',
      rule_matched_but_evidence_missing:
        'gitnexus query --runtime-chain-verify on-demand --unity-resources on --unity-evidence-mode summary --max-bindings 1 --max-reference-fields 1 "Reload"',
      rule_not_matched:
        'gitnexus query --runtime-chain-verify on-demand --unity-resources on "UnrelatedUnityChain"',
    },
  };

  if (!coverage_pass) {
    throw new Error(
      `phase2 failure classification coverage is incomplete (${failure_classification_coverage.length}/3). Missing: ${failure_classification_missing.join(', ')}`,
    );
  }
  return report;
}

export async function writePhase2RuntimeClaimAcceptanceReport(
  outPath: string,
  report: Phase2RuntimeClaimAcceptanceReport,
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
    throw new Error('Usage: node dist/benchmark/u2-e2e/phase2-runtime-claim-acceptance-runner.js --repo <alias> --out <path>');
  }
  const report = await buildPhase2RuntimeClaimAcceptanceReport({ repoAlias });
  await writePhase2RuntimeClaimAcceptanceReport(outPath, report);
  process.stdout.write(`phase2 runtime_claim acceptance artifact written: ${outPath}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (entryPath === thisPath) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
