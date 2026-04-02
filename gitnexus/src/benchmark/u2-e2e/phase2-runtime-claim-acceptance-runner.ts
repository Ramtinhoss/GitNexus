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
  samples: {
    matched_status?: string;
    unmatched_reason?: string;
    gate_disabled_reason?: string;
  };
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
  const unmatched = await backend.callTool('query', {
    repo: input.repoAlias,
    query: 'UnrelatedUnityChain',
    unity_resources: 'on',
    runtime_chain_verify: 'on-demand',
  });

  const originalGate = process.env.GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY;
  process.env.GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY = 'off';
  let gateDisabled: any;
  try {
    gateDisabled = await backend.callTool('query', {
      repo: input.repoAlias,
      query: 'Reload',
      unity_resources: 'on',
      runtime_chain_verify: 'on-demand',
    });
  } finally {
    if (originalGate === undefined) {
      delete process.env.GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY;
    } else {
      process.env.GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY = originalGate;
    }
  }

  const claim = (matched as any).runtime_claim || {};
  const reasons = [
    (unmatched as any).runtime_claim?.reason,
    (gateDisabled as any).runtime_claim?.reason,
  ]
    .filter(Boolean)
    .map((reason) => String(reason));
  const failure_classification_coverage = [...new Set(reasons)];

  return {
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
    samples: {
      matched_status: claim.status,
      unmatched_reason: (unmatched as any).runtime_claim?.reason,
      gate_disabled_reason: (gateDisabled as any).runtime_claim?.reason,
    },
  };
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
