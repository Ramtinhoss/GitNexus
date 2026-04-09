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
  assert.equal(
    report.acceptance.pass,
    report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass && report.workflow_replay_slim.reload.semantic_tuple_pass,
  );
});
