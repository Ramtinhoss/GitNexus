import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSubagentPrompt, loadSubagentLiveCaseResult, prepareSubagentCaseRun } from './subagent-live.js';
import type { AgentSafeBenchmarkCase } from './types.js';

const fakeCase: AgentSafeBenchmarkCase = {
  label: 'weapon_powerup',
  start_query: 'weapon powerup equip chain',
  retry_query: 'retry',
  proof_contexts: ['HoldPickup', 'EquipWithEvent'],
  proof_cypher:
    "MATCH (src)-[:CodeRelation {type: 'CALLS'}]->(dst) WHERE (src.name = 'HoldPickup' AND dst.name = 'PickItUp') OR (src.name = 'EquipWithEvent' AND dst.name = 'Equip') RETURN src.name, dst.name",
  tool_plan: [{ tool: 'query', input: { query: 'WeaponPowerUp' } }],
  live_task: {
    objective: 'pickup/equip bridge proof',
    symbol_seed: 'WeaponPowerUp',
    resource_seed: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
  },
  semantic_tuple: {
    resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
    symbol_anchor: 'WeaponPowerUp',
    proof_edges: [
      'HoldPickup -> WeaponPowerUp.PickItUp',
      'EquipWithEvent -> WeaponPowerUp.Equip',
    ],
    closure_status: 'not_verified_full',
  },
};

test('buildSubagentPrompt includes wrapper command and final JSON schema without leaking canonical proof edges', () => {
  const prompt = buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir: '/tmp/run',
    resultPath: '/tmp/run/result.json',
  });

  assert.equal(prompt.includes('telemetry-tool.js'), true);
  assert.equal(prompt.includes('Final JSON schema:'), true);
  assert.equal(prompt.includes('strongest supported relation'), false);
  assert.equal(prompt.includes('pickup/equip bridge proof'), true);
  assert.equal(prompt.includes('HoldPickup -> WeaponPowerUp.PickItUp'), false);
  assert.equal(prompt.includes('EquipWithEvent -> WeaponPowerUp.Equip'), false);
});

test('prepareSubagentCaseRun writes prompt artifact', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const prepared = await prepareSubagentCaseRun(runDir, fakeCase, { repo: 'neonspark-core' });

  const prompt = await fs.readFile(prepared.promptPath, 'utf-8');
  assert.equal(prompt.includes('WeaponPowerUp'), true);
  assert.equal(prompt.includes('telemetry-tool.js'), true);
});

test('loadSubagentLiveCaseResult validates telemetry rows and derives semantic tuple from tool evidence', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const promptPath = path.join(runDir, 'prompt.txt');
  const resultPath = path.join(runDir, 'result.json');
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');

  await fs.writeFile(promptPath, buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir,
    resultPath,
  }), 'utf-8');
  await fs.writeFile(resultPath, JSON.stringify({
    resource_anchor: fakeCase.semantic_tuple.resource_anchor,
    symbol_anchor: fakeCase.semantic_tuple.symbol_anchor,
    proof_edges: fakeCase.semantic_tuple.proof_edges,
    closure_status: 'not_verified_full',
    summary: 'Found supporting pickup/equip evidence.',
  }, null, 2));
  await fs.writeFile(
    telemetryPath,
    [
      JSON.stringify({
        tool: 'query',
        input: { query: 'WeaponPowerUp', repo: 'neonspark-core' },
        output: {
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ target: fakeCase.semantic_tuple.resource_anchor }],
        },
        durationMs: 12,
        totalTokensEst: 120,
        timestamp: '2026-04-08T00:00:00.000Z',
      }),
      JSON.stringify({
        tool: 'cypher',
        input: { query: fakeCase.proof_cypher, repo: 'neonspark-core' },
        output: {
          markdown: '| src.name | dst.name |\n| --- | --- |\n| HoldPickup | PickItUp |\n| EquipWithEvent | Equip |',
          row_count: 2,
        },
        durationMs: 8,
        totalTokensEst: 80,
        timestamp: '2026-04-08T00:00:01.000Z',
      }),
    ].join('\n'),
    'utf-8',
  );

  const result = await loadSubagentLiveCaseResult(runDir, fakeCase);
  assert.equal(result.normalized_tuple_pass, true);
  assert.equal(result.evidence_validation_pass, true);
  assert.equal(result.failure_class, undefined);
  assert.equal(result.semantic_tuple_pass, true);
  assert.equal(result.tool_calls_to_completion, 2);
  assert.equal(result.tokens_to_completion, 200);
});

test('loadSubagentLiveCaseResult keeps case non-passing when evidence validation fails', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const promptPath = path.join(runDir, 'prompt.txt');
  const resultPath = path.join(runDir, 'result.json');
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');

  await fs.writeFile(promptPath, buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir,
    resultPath,
  }), 'utf-8');
  await fs.writeFile(resultPath, JSON.stringify({
    resource_anchor: fakeCase.semantic_tuple.resource_anchor,
    symbol_anchor: 'Game.Runtime.WeaponPowerUp',
    proof_edges: [
      { caller: 'HoldPickup', callee: 'WeaponPowerUp.PickItUp' },
      { caller: 'EquipWithEvent', callee: 'WeaponPowerUp.Equip' },
    ],
    closure_status: 'not_verified_full',
    summary: 'Normalized tuple inferred from final response.',
  }, null, 2));
  await fs.writeFile(
    telemetryPath,
    JSON.stringify({
      tool: 'query',
      input: { query: 'WeaponPowerUp', repo: 'neonspark-core' },
      output: {
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [{ target: fakeCase.semantic_tuple.resource_anchor }],
      },
      durationMs: 12,
      totalTokensEst: 120,
      timestamp: '2026-04-08T00:00:00.000Z',
    }),
    'utf-8',
  );

  const result = await loadSubagentLiveCaseResult(runDir, fakeCase);
  assert.equal(result.normalized_tuple_pass, true);
  assert.equal(result.evidence_validation_pass, false);
  assert.equal(result.semantic_tuple_pass, false);
  assert.equal(result.failure_class, 'evidence_missing');
});

test('loadSubagentLiveCaseResult rejects non-allowlisted tools', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const promptPath = path.join(runDir, 'prompt.txt');
  const resultPath = path.join(runDir, 'result.json');
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');

  await fs.writeFile(promptPath, buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir,
    resultPath,
  }), 'utf-8');
  await fs.writeFile(resultPath, JSON.stringify({ summary: 'noop' }), 'utf-8');
  await fs.writeFile(
    telemetryPath,
    JSON.stringify({
      tool: 'impact',
      input: {},
      output: {},
      durationMs: 1,
      totalTokensEst: 1,
      timestamp: '2026-04-08T00:00:00.000Z',
    }),
    'utf-8',
  );

  await assert.rejects(() => loadSubagentLiveCaseResult(runDir, fakeCase), /non-allowlisted tool/);
});
