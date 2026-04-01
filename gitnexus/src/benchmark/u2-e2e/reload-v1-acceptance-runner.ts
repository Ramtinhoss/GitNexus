import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRegisteredRepos } from '../../storage/repo-manager.js';
import { getCurrentCommit } from '../../storage/git.js';
import type { RuntimeChainResult } from '../../mcp/local/runtime-chain-verify.js';
import { LocalBackend } from '../../mcp/local/local-backend.js';

const PLACEHOLDER_RE = /TODO|TBD|placeholder|<symbol-or-query>/i;

export interface AnchorValidationRow {
  anchor: string;
  valid: boolean;
  reason?: string;
}

export interface ReloadAcceptanceArtifact {
  generatedAt: string;
  repoAlias: string;
  repoPath: string;
  status: {
    indexedCommit: string;
    currentCommit: string;
    upToDate: boolean;
    raw: string;
  };
  commands: Array<{
    command: string;
    output: unknown;
  }>;
  runtime_chain: RuntimeChainResult;
  anchor_validation: AnchorValidationRow[];
}

export function containsPlaceholderText(value: unknown): boolean {
  return PLACEHOLDER_RE.test(String(value || ''));
}

function parseAnchor(anchor: string): { filePath: string; line: number } | null {
  const match = String(anchor || '').match(/^(.*):(\d+)$/);
  if (!match) return null;
  return { filePath: match[1], line: Number(match[2]) };
}

export async function validateAnchorAuthenticity(
  repoPath: string,
  hop: { anchor?: string; snippet?: string },
): Promise<AnchorValidationRow> {
  const anchor = String(hop.anchor || '').trim();
  if (!anchor) return { anchor, valid: false, reason: 'anchor missing' };
  if (containsPlaceholderText(anchor)) return { anchor, valid: false, reason: 'anchor contains placeholder text' };
  const parsed = parseAnchor(anchor);
  if (!parsed) return { anchor, valid: false, reason: 'anchor format invalid' };

  const resolvedPath = path.isAbsolute(parsed.filePath)
    ? parsed.filePath
    : path.join(repoPath, parsed.filePath);

  let raw: string;
  try {
    raw = await fs.readFile(resolvedPath, 'utf-8');
  } catch {
    return { anchor, valid: false, reason: 'anchor file does not exist' };
  }

  const lines = raw.split(/\r?\n/);
  if (parsed.line < 1 || parsed.line > lines.length) {
    return { anchor, valid: false, reason: 'anchor line out of range' };
  }

  const expectedSnippet = String(hop.snippet || '').trim();
  if (expectedSnippet && !lines[parsed.line - 1].includes(expectedSnippet)) {
    return { anchor, valid: false, reason: 'anchor snippet mismatch' };
  }

  return { anchor, valid: true };
}

export async function validateReloadAcceptanceArtifact(
  artifact: ReloadAcceptanceArtifact,
): Promise<{ ok: boolean; failures: string[]; anchorValidation: AnchorValidationRow[] }> {
  const failures: string[] = [];
  const chain = artifact.runtime_chain;

  if (containsPlaceholderText(JSON.stringify(chain))) {
    failures.push('placeholder text leaked into runtime_chain');
  }

  const hopTypes = new Set((chain?.hops || []).map((hop) => hop.hop_type));
  for (const required of ['resource', 'guid_map', 'code_loader', 'code_runtime']) {
    if (!hopTypes.has(required as any)) {
      failures.push(`missing required ${required} hop`);
    }
  }

  if (chain?.status === 'verified_full' && (!Array.isArray(chain.hops) || chain.hops.length === 0)) {
    failures.push('verified_full requires non-empty hops');
  }

  const anchorValidation = await Promise.all((chain?.hops || []).map((hop) => validateAnchorAuthenticity(artifact.repoPath, hop)));
  anchorValidation
    .filter((row) => !row.valid)
    .forEach((row) => failures.push(row.reason || 'invalid anchor'));

  return {
    ok: failures.length === 0,
    failures,
    anchorValidation,
  };
}

function buildStatus(repoPath: string, indexedCommit: string): ReloadAcceptanceArtifact['status'] {
  const currentCommit = String(getCurrentCommit(repoPath) || '').trim();
  const upToDate = indexedCommit === currentCommit;
  const raw = [
    `Repository: ${repoPath}`,
    `Indexed commit: ${indexedCommit}`,
    `Current commit: ${currentCommit}`,
    `Status: ${upToDate ? '✅ up-to-date' : '⚠️ stale (re-run gitnexus analyze)'}`,
  ].join('\n');
  return { indexedCommit, currentCommit, upToDate, raw };
}

async function runBackendCommand(backend: LocalBackend, command: string, method: string, params: Record<string, unknown>): Promise<{ command: string; output: unknown }> {
  return {
    command,
    output: await backend.callTool(method, params),
  };
}

export async function buildReloadAcceptanceArtifact(input: {
  repoAlias: string;
  requireStatusMatch?: boolean;
}): Promise<ReloadAcceptanceArtifact> {
  const repos = await listRegisteredRepos({ validate: false });
  const repo = repos.find((entry) => entry.name === input.repoAlias);
  if (!repo) {
    throw new Error(`Repo alias not found: ${input.repoAlias}`);
  }

  const distCli = path.resolve('gitnexus/dist/cli/index.js');
  const env = { ...process.env, GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS: 'on' };
  const status = buildStatus(repo.path, repo.lastCommit);
  if (input.requireStatusMatch && !status.upToDate) {
    throw new Error(`status mismatch for ${input.repoAlias}`);
  }

  const backend = new LocalBackend();
  const ready = await backend.init();
  if (!ready) {
    throw new Error('LocalBackend failed to initialize for acceptance runner');
  }

  const commands = await Promise.all([
    runBackendCommand(
      backend,
      `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node ${distCli} query -r ${input.repoAlias} --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"`,
      'query',
      {
        repo: input.repoAlias,
        query: 'Reload NEON.Game.Graph.Nodes.Reloads',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        runtime_chain_verify: 'on-demand',
      },
    ),
    runBackendCommand(
      backend,
      `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node ${distCli} query -r ${input.repoAlias} --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "PickItUp EquipWithEvent WeaponPowerUp Equip CurGunGraph"`,
      'query',
      {
        repo: input.repoAlias,
        query: 'PickItUp EquipWithEvent WeaponPowerUp Equip CurGunGraph',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        runtime_chain_verify: 'on-demand',
      },
    ),
    runBackendCommand(
      backend,
      `GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on node ${distCli} context -r ${input.repoAlias} --file Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand Reload`,
      'context',
      {
        repo: input.repoAlias,
        name: 'Reload',
        file_path: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        runtime_chain_verify: 'on-demand',
      },
    ),
  ]);

  const runtime_chain = (commands[0].output as any)?.runtime_chain;
  if (!runtime_chain) {
    throw new Error('runtime_chain missing from reload query');
  }

  const artifact: ReloadAcceptanceArtifact = {
    generatedAt: new Date().toISOString(),
    repoAlias: input.repoAlias,
    repoPath: repo.path,
    status,
    commands: [
      {
        command: `node ${distCli} status`,
        output: status.raw,
      },
      ...commands,
    ],
    runtime_chain,
    anchor_validation: [],
  };
  const validation = await validateReloadAcceptanceArtifact(artifact);
  artifact.anchor_validation = validation.anchorValidation;
  if (!validation.ok) {
    throw new Error(validation.failures.join('\n'));
  }
  return artifact;
}

export async function writeReloadAcceptanceArtifact(outPath: string, artifact: ReloadAcceptanceArtifact): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(artifact, null, 2));
}

async function main(argv: string[]): Promise<void> {
  const verifyOnlyIndex = argv.indexOf('--verify-only');
  if (verifyOnlyIndex >= 0) {
    const inputPath = path.resolve(argv[verifyOnlyIndex + 1] || '');
    const artifact = JSON.parse(await fs.readFile(inputPath, 'utf-8')) as ReloadAcceptanceArtifact;
    const validation = await validateReloadAcceptanceArtifact(artifact);
    if (!validation.ok) {
      throw new Error(validation.failures.join('\n'));
    }
    process.stdout.write(`reload acceptance verification passed: ${inputPath}\n`);
    return;
  }

  const repoIndex = argv.indexOf('--repo');
  const outIndex = argv.indexOf('--out');
  const requireStatusMatch = argv.includes('--require-status-match');
  const repoAlias = String(argv[repoIndex + 1] || '').trim();
  const outPath = path.resolve(String(argv[outIndex + 1] || '').trim());
  if (!repoAlias || !outPath) {
    throw new Error('Usage: node dist/benchmark/u2-e2e/reload-v1-acceptance-runner.js --repo <alias> --out <path> [--require-status-match] | --verify-only <path>');
  }

  const artifact = await buildReloadAcceptanceArtifact({ repoAlias, requireStatusMatch });
  await writeReloadAcceptanceArtifact(outPath, artifact);
  process.stdout.write(`reload acceptance artifact written: ${outPath}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (entryPath === thisPath) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
