import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalBackend } from '../../mcp/local/local-backend.js';

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
    gate_disabled_reason?: string;
  };
  reproduction_commands: Record<string, string>;
}

export async function buildPhase2RuntimeClaimAcceptanceReport(input: {
  repoAlias: string;
}): Promise<Phase2RuntimeClaimAcceptanceReport> {
  const backend = new LocalBackend();
  const ready = await backend.init();
  if (!ready) {
    throw new Error('LocalBackend failed to initialize for phase2 acceptance runner');
  }

  const matched = await backend.callTool('query', {
    repo: input.repoAlias,
    query: 'Reload',
    unity_resources: 'on',
    runtime_chain_verify: 'on-demand',
  });
  const evidenceMissing = await backend.callTool('query', {
    repo: input.repoAlias,
    query: 'Reload',
    unity_resources: 'on',
    runtime_chain_verify: 'on-demand',
    unity_evidence_mode: 'summary',
    max_bindings: 1,
    max_reference_fields: 1,
  });
  const unmatched = await backend.callTool('query', {
    repo: input.repoAlias,
    query: 'UnrelatedUnityChain',
    unity_resources: 'on',
    runtime_chain_verify: 'on-demand',
  });

  // gate_disabled reason is no longer produced (env var gate removed in config migration)
  let gateDisabled: any;
  try {
    gateDisabled = await backend.callTool('query', {
      repo: input.repoAlias,
      query: 'Reload',
      unity_resources: 'on',
      runtime_chain_verify: 'off',
    });
  } finally {
  }

  const claim = (matched as any).runtime_claim || {};
  const requiredReasons = [
    'rule_not_matched',
    'rule_matched_but_evidence_missing',
    'rule_matched_but_verification_failed',
    'gate_disabled',
  ];
  const reasons = [
    claim.reason,
    (evidenceMissing as any).runtime_claim?.reason,
    (unmatched as any).runtime_claim?.reason,
    (gateDisabled as any).runtime_claim?.reason,
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
      evidence_missing_reason: (evidenceMissing as any).runtime_claim?.reason,
      verification_failed_reason: claim.reason,
      unmatched_reason: (unmatched as any).runtime_claim?.reason,
      gate_disabled_reason: (gateDisabled as any).runtime_claim?.reason,
    },
    reproduction_commands: {
      rule_matched_but_verification_failed:
        `gitnexus query --repo ${input.repoAlias} --runtime-chain-verify on-demand --unity-resources on "Reload"`,
      rule_matched_but_evidence_missing:
        `gitnexus query --repo ${input.repoAlias} --runtime-chain-verify on-demand --unity-resources on --unity-evidence-mode summary --max-bindings 1 --max-reference-fields 1 "Reload"`,
      rule_not_matched:
        `gitnexus query --repo ${input.repoAlias} --runtime-chain-verify on-demand --unity-resources on "UnrelatedUnityChain"`,
      gate_disabled:
        `gitnexus query --repo ${input.repoAlias} --runtime-chain-verify off --unity-resources on "Reload"`,
    },
  };

  if (!coverage_pass) {
    throw new Error(
      `phase2 failure classification coverage is incomplete (${failure_classification_coverage.length}/4). Missing: ${failure_classification_missing.join(', ')}`,
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
