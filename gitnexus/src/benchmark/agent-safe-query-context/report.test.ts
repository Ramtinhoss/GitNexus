import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentSafeQueryContextBenchmark } from './report.js';
import type { AgentSafeBenchmarkSuite } from './types.js';

const fakeSuite: AgentSafeBenchmarkSuite = {
  thresholds: {
    workflowReplay: { maxSteps: 5 },
    tokenReduction: {
      weapon_powerup: 0.5,
      reload: 0.4,
    },
  },
  cases: {
    weapon_powerup: {
      label: 'weapon_powerup',
      start_query: 'weapon powerup equip chain',
      retry_query: '1_weapon_orb_key.asset WeaponPowerUp HoldPickup EquipWithEvent Equip',
      proof_contexts: ['WeaponPowerUp'],
      proof_cypher: 'MATCH () RETURN 1',
      tool_plan: [{ tool: 'query', input: { query: 'weapon powerup equip chain' } }],
      live_task: {
        objective: 'Investigate WeaponPowerUp from the provided asset seed and report the best supported runtime relation.',
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
    },
    reload: {
      label: 'reload',
      start_query: 'reload getvalue checkreload',
      retry_query: 'Gungraph_use/1_weapon_orb_key.asset ReloadBase GetValue CheckReload',
      proof_contexts: ['ReloadBase'],
      proof_cypher: 'MATCH () RETURN 1',
      tool_plan: [{ tool: 'query', input: { query: 'reload getvalue checkreload' } }],
      live_task: {
        objective: 'Investigate ReloadBase from the provided graph asset seed and report the best supported reload relation.',
        symbol_seed: 'ReloadBase',
        resource_seed: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
      },
      semantic_tuple: {
        resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
        symbol_anchor: 'ReloadBase',
        proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
        closure_status: 'not_verified_full',
      },
    },
  },
};

test('benchmark report includes explicit benchmark tracks', async () => {
  const report = await runAgentSafeQueryContextBenchmark(fakeSuite, {
    repo: 'neonspark-core',
    subagentRunsDir: '/tmp/subagent-runs',
  }, {
    runner: {
      query: async (input) => {
        const queryText = String(input?.query || '');
        if (/reload|ReloadBase|CheckReload/.test(queryText)) {
          return {
            candidates: [{ name: 'ReloadBase' }],
            resource_hints: [{ path: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
          };
        }
        return {
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ path: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        };
      },
      context: async (input) => ({ symbol: { name: String(input?.name || 'WeaponPowerUp') } }),
      impact: async () => ({ impactedCount: 0 }),
      cypher: async (input) => {
        const queryText = String(input?.query || '');
        if (queryText.includes('CheckReload') || queryText.includes('GetValue')) {
          return { row_count: 1, rows: [{ src: 'GetValue', dst: 'CheckReload' }] };
        }
        return {
          row_count: 2,
          rows: [
            { src: 'HoldPickup', dst: 'PickItUp' },
            { src: 'EquipWithEvent', dst: 'Equip' },
          ],
        };
      },
      close: async () => {},
    },
    executeToolPlan: async (plan) =>
      plan.map((step) => ({
        tool: step.tool,
        input: step.input,
        output: {
          anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          symbol: 'WeaponPowerUp',
          proof: 'HoldPickup -> WeaponPowerUp.PickItUp',
        },
      })),
    loadSubagentLiveCaseResult: async (_runDir, benchmarkCase) => ({
      prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
      prompt_path: '/tmp/prompt.txt',
      result_path: '/tmp/result.json',
      telemetry_path: '/tmp/telemetry.jsonl',
      final_result: {},
      steps: [{
        tool: 'query',
        input: { query: benchmarkCase.start_query },
        output: { value: benchmarkCase.semantic_tuple.resource_anchor },
        durationMs: 1,
        totalTokensEst: 10,
        timestamp: '2026-04-08T00:00:00.000Z',
      }],
      semantic_tuple: benchmarkCase.semantic_tuple,
      normalized_tuple_pass: true,
      evidence_validation_pass: true,
      failure_class: undefined,
      semantic_tuple_pass: true,
      tool_calls_to_completion: 1,
      tokens_to_completion: 10,
      stop_reason: 'semantic_tuple_satisfied' as const,
    }),
  });

  assert.equal(report.cases.weapon_powerup.semantic_tuple_pass, true);
  assert.ok(report.same_script.tool_plan.weapon_powerup);
  assert.ok(report.subagent_live.reload.steps);
  assert.ok(report.token_summary.weapon_powerup);
  assert.ok(report.call_summary.reload);
  assert.ok(report.workflow_replay_full.weapon_powerup);
  assert.ok(report.workflow_replay_slim.weapon_powerup);
  assert.ok(report.same_script_full.reload);
  assert.ok(report.same_script_slim.reload);
  assert.ok(report.subagent_live.weapon_powerup);
  assert.equal(report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass, true);
  assert.equal(typeof report.workflow_replay_slim.weapon_powerup.anchor_top1_pass, 'boolean');
  assert.equal(typeof report.workflow_replay_slim.weapon_powerup.recommended_follow_up_hit, 'boolean');
  assert.equal(typeof report.workflow_replay_slim.weapon_powerup.post_narrowing_anchor_pass, 'boolean');
  assert.equal(typeof report.workflow_replay_slim.weapon_powerup.post_narrowing_follow_up_hit, 'boolean');
  assert.equal(typeof report.workflow_replay_slim.weapon_powerup.ambiguity_detour_count, 'number');
  assert.equal(
    report.acceptance.pass,
    report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_anchor_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_follow_up_hit
      && !report.workflow_replay_slim.weapon_powerup.placeholder_leak_detected
      && !report.workflow_replay_slim.weapon_powerup.heuristic_top_summary_detected
      && report.workflow_replay_slim.reload.semantic_tuple_pass
      && report.workflow_replay_slim.reload.post_narrowing_anchor_pass
      && report.workflow_replay_slim.reload.post_narrowing_follow_up_hit
      && !report.workflow_replay_slim.reload.placeholder_leak_detected
      && !report.workflow_replay_slim.reload.heuristic_top_summary_detected,
  );
});

test('benchmark report enforces track split, acceptance source, prompt secrecy, and live scoring taxonomy', async () => {
  const report = await runAgentSafeQueryContextBenchmark(fakeSuite, {
    repo: 'neonspark-core',
    subagentRunsDir: '/tmp/subagent-runs',
  }, {
    runner: {
      query: async (input) => {
        const queryText = String(input?.query || '');
        if (/reload|ReloadBase|CheckReload/.test(queryText)) {
          return {
            candidates: [{ name: 'ReloadBase' }],
            resource_hints: [{ path: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
          };
        }
        return {
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ path: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        };
      },
      context: async (input) => ({ symbol: { name: String(input?.name || 'WeaponPowerUp') } }),
      impact: async () => ({ impactedCount: 0 }),
      cypher: async (input) => {
        const queryText = String(input?.query || '');
        if (queryText.includes('CheckReload') || queryText.includes('GetValue')) {
          return { row_count: 1, rows: [{ src: 'GetValue', dst: 'CheckReload' }] };
        }
        return {
          row_count: 2,
          rows: [
            { src: 'HoldPickup', dst: 'PickItUp' },
            { src: 'EquipWithEvent', dst: 'Equip' },
          ],
        };
      },
      close: async () => {},
    },
    executeToolPlan: async (plan) =>
      plan.map((step) => ({
        tool: step.tool,
        input: step.input,
        output: {
          anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          symbol: 'WeaponPowerUp',
          proof: 'HoldPickup -> WeaponPowerUp.PickItUp',
        },
      })),
    loadSubagentLiveCaseResult: async (_runDir, benchmarkCase) => ({
      prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
      prompt_path: '/tmp/prompt.txt',
      result_path: '/tmp/result.json',
      telemetry_path: '/tmp/telemetry.jsonl',
      final_result: {},
      steps: [{
        tool: 'query',
        input: { query: benchmarkCase.start_query },
        output: { value: benchmarkCase.semantic_tuple.resource_anchor },
        durationMs: 1,
        totalTokensEst: 10,
        timestamp: '2026-04-08T00:00:00.000Z',
      }],
      semantic_tuple: benchmarkCase.semantic_tuple,
      normalized_tuple_pass: true,
      evidence_validation_pass: true,
      failure_class: undefined,
      semantic_tuple_pass: true,
      tool_calls_to_completion: 1,
      tokens_to_completion: 10,
      stop_reason: 'semantic_tuple_satisfied' as const,
    }),
  });

  assert.equal(Object.keys(report.workflow_replay_full).length > 0, true);
  assert.equal(Object.keys(report.workflow_replay_slim).length > 0, true);
  assert.equal(Object.keys(report.same_script_full).length > 0, true);
  assert.equal(Object.keys(report.same_script_slim).length > 0, true);
  assert.equal(Object.keys(report.subagent_live).length > 0, true);

  assert.deepEqual(report.acceptance.cases, {
    weapon_powerup:
      report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_anchor_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_follow_up_hit
      && !report.workflow_replay_slim.weapon_powerup.placeholder_leak_detected
      && !report.workflow_replay_slim.weapon_powerup.heuristic_top_summary_detected,
    reload:
      report.workflow_replay_slim.reload.semantic_tuple_pass
      && report.workflow_replay_slim.reload.post_narrowing_anchor_pass
      && report.workflow_replay_slim.reload.post_narrowing_follow_up_hit
      && !report.workflow_replay_slim.reload.placeholder_leak_detected
      && !report.workflow_replay_slim.reload.heuristic_top_summary_detected,
  });

  assert.equal(report.subagent_live.weapon_powerup.prompt.includes('HoldPickup -> WeaponPowerUp.PickItUp'), false);
  assert.equal(report.subagent_live.reload.prompt.includes('ReloadBase.GetValue -> ReloadBase.CheckReload'), false);

  for (const row of Object.values(report.subagent_live)) {
    assert.equal(typeof row.normalized_tuple_pass, 'boolean');
    assert.equal(typeof row.evidence_validation_pass, 'boolean');
    if (!row.semantic_tuple_pass) {
      assert.ok(row.failure_class);
    }
  }
});

test('acceptance fails when semantic tuple passes but placeholder leakage is detected', async () => {
  const report = await runAgentSafeQueryContextBenchmark(fakeSuite, {
    repo: 'neonspark-core',
    subagentRunsDir: '/tmp/subagent-runs',
  }, {
    runner: {
      query: async (input) => {
        const queryText = String(input?.query || '');
        if (/reload|ReloadBase|CheckReload/.test(queryText)) {
          return {
            summary: 'ReloadBase flow',
            decision: {
              primary_candidate: 'ReloadBase',
              recommended_follow_up: 'resource_path_prefix=Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
            },
            candidates: [{ name: 'ReloadBase' }],
            resource_hints: [{ target: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
          };
        }
        return {
          summary: 'WeaponPowerUp flow',
          decision: {
            primary_candidate: 'WeaponPowerUp',
            recommended_follow_up: 'resource_path_prefix=Reload NEON.Game.Graph.Nodes.Reloads',
          },
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ target: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        };
      },
      context: async (input) => ({ symbol: { name: String(input?.name || 'WeaponPowerUp') } }),
      impact: async () => ({ impactedCount: 0 }),
      cypher: async (input) => {
        const queryText = String(input?.query || '');
        if (queryText.includes('CheckReload') || queryText.includes('GetValue')) {
          return { row_count: 1, rows: [{ src: 'GetValue', dst: 'CheckReload' }] };
        }
        return {
          row_count: 2,
          rows: [
            { src: 'HoldPickup', dst: 'PickItUp' },
            { src: 'EquipWithEvent', dst: 'Equip' },
          ],
        };
      },
      close: async () => {},
    },
    executeToolPlan: async (plan) =>
      plan.map((step) => ({
        tool: step.tool,
        input: step.input,
        output: {
          anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          symbol: 'WeaponPowerUp',
          proof: 'HoldPickup -> WeaponPowerUp.PickItUp',
        },
      })),
    loadSubagentLiveCaseResult: async (_runDir, benchmarkCase) => ({
      prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
      prompt_path: '/tmp/prompt.txt',
      result_path: '/tmp/result.json',
      telemetry_path: '/tmp/telemetry.jsonl',
      final_result: {},
      steps: [{
        tool: 'query',
        input: { query: benchmarkCase.start_query },
        output: { value: benchmarkCase.semantic_tuple.resource_anchor },
        durationMs: 1,
        totalTokensEst: 10,
        timestamp: '2026-04-08T00:00:00.000Z',
      }],
      semantic_tuple: benchmarkCase.semantic_tuple,
      normalized_tuple_pass: true,
      evidence_validation_pass: true,
      failure_class: undefined,
      semantic_tuple_pass: true,
      tool_calls_to_completion: 1,
      tokens_to_completion: 10,
      stop_reason: 'semantic_tuple_satisfied' as const,
    }),
  });

  assert.equal(report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass, true);
  assert.equal(report.workflow_replay_slim.weapon_powerup.placeholder_leak_detected, true);
  assert.equal(report.acceptance.cases.weapon_powerup, false);
  assert.equal(report.acceptance.pass, false);
});
