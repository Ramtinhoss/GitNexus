import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAgentSafeQueryContextCommand } from './benchmark-agent-safe-query-context.js';

test('benchmark-agent-safe-query-context runs suite loader, benchmark, and report writer', async () => {
  const output: string[] = [];
  const calls: Array<{ repo?: string }> = [];

  await benchmarkAgentSafeQueryContextCommand('../benchmarks/agent-safe-query-context/neonspark-v1', {
    repo: 'neonspark-core',
    reportDir: '.gitnexus/benchmark-agent-safe-query-context-test',
    subagentRunsDir: '.gitnexus/subagent-runs',
    skipAnalyze: true,
  }, {
    loadSuite: async () => ({
      thresholds: {
        workflowReplay: { maxSteps: 5 },
        tokenReduction: { weapon_powerup: 0.5, reload: 0.4 },
      },
      cases: {
        weapon_powerup: {
          label: 'weapon_powerup',
          start_query: 'weapon powerup equip chain',
          retry_query: 'retry',
          proof_contexts: ['WeaponPowerUp'],
          proof_cypher: 'MATCH () RETURN 1',
          tool_plan: [],
          live_task: {
            objective: 'Investigate WeaponPowerUp from the provided asset seed.',
            symbol_seed: 'WeaponPowerUp',
            resource_seed: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          },
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
            symbol_anchor: 'WeaponPowerUp',
            proof_edges: ['HoldPickup -> WeaponPowerUp.PickItUp'],
            closure_status: 'not_verified_full',
          },
        },
        reload: {
          label: 'reload',
          start_query: 'reload getvalue checkreload',
          retry_query: 'retry',
          proof_contexts: ['ReloadBase'],
          proof_cypher: 'MATCH () RETURN 1',
          tool_plan: [],
          live_task: {
            objective: 'Investigate ReloadBase from the provided graph seed.',
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
    }),
    runBenchmark: async (_suite, options) => {
      calls.push({ repo: options.repo });
      const sameScriptCases = {
        weapon_powerup: {
          tool_plan: [],
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
            symbol_anchor: 'WeaponPowerUp',
            proof_edges: ['HoldPickup -> WeaponPowerUp.PickItUp'],
            closure_status: 'not_verified_full' as const,
          },
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
        },
        reload: {
          tool_plan: [],
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
            symbol_anchor: 'ReloadBase',
            proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
            closure_status: 'not_verified_full' as const,
          },
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
        },
      };
      const subagentLive = {
        weapon_powerup: {
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
            symbol_anchor: 'WeaponPowerUp',
            proof_edges: ['HoldPickup -> WeaponPowerUp.PickItUp'],
            closure_status: 'not_verified_full' as const,
          },
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
          stop_reason: 'semantic_tuple_satisfied' as const,
          prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
          prompt_path: '/tmp/prompt.txt',
          result_path: '/tmp/result.json',
          telemetry_path: '/tmp/telemetry.jsonl',
          final_result: {},
        },
        reload: {
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
            symbol_anchor: 'ReloadBase',
            proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
            closure_status: 'not_verified_full' as const,
          },
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
          stop_reason: 'semantic_tuple_satisfied' as const,
          prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
          prompt_path: '/tmp/prompt.txt',
          result_path: '/tmp/result.json',
          telemetry_path: '/tmp/telemetry.jsonl',
          final_result: {},
        },
      };
      return {
        generatedAt: '2026-04-08T00:00:00.000Z',
        workflow_replay_full: sameScriptCases,
        workflow_replay_slim: sameScriptCases,
        same_script_full: sameScriptCases,
        same_script_slim: sameScriptCases,
        cases: subagentLive,
        same_script: {
          tool_plan: { weapon_powerup: [], reload: [] },
          cases: sameScriptCases,
        },
        subagent_live: subagentLive,
        semantic_equivalence: { pass: true, cases: { weapon_powerup: true, reload: true } },
        token_summary: {
          weapon_powerup: { before: 1, after: 1, saved: 0, reduction: 0 },
          reload: { before: 1, after: 1, saved: 0, reduction: 0 },
        },
        call_summary: {
          weapon_powerup: { before: 1, after: 1, saved: 0 },
          reload: { before: 1, after: 1, saved: 0 },
        },
      };
    },
    writeReports: async () => {},
    writeLine: (line: string) => output.push(line),
    analyze: async () => ({ stdout: '', stderr: '' }),
  });

  assert.equal(calls[0].repo, 'neonspark-core');
  assert.ok(output.some((line) => line.includes('Report:')));
});
