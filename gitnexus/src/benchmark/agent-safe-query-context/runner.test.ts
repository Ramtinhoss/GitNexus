import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflowReplay } from './runner.js';
import type { AgentSafeBenchmarkCase } from './types.js';

const fakeCase: AgentSafeBenchmarkCase = {
  label: 'weapon_powerup',
  start_query: 'weapon powerup equip chain',
  retry_query: '1_weapon_orb_key.asset WeaponPowerUp HoldPickup EquipWithEvent Equip',
  proof_contexts: ['WeaponPowerUp'],
  proof_cypher:
    "MATCH (src)-[:CodeRelation {type: 'CALLS'}]->(dst) WHERE src.name IN ['HoldPickup', 'EquipWithEvent'] RETURN src.name, dst.name",
  tool_plan: [
    { tool: 'query', input: { query: 'weapon powerup equip chain' } },
    { tool: 'context', input: { name: 'WeaponPowerUp' } },
    { tool: 'cypher', input: { query: "MATCH (src)-[:CodeRelation {type: 'CALLS'}]->(dst) RETURN src.name, dst.name" } },
  ],
  live_task: {
    objective: 'Investigate WeaponPowerUp from the provided asset seed and return the strongest supported pickup/equip runtime relation.',
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

test('workflow replay narrows query only when retry triggers fire', async () => {
  const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
  let queryCount = 0;

  const fakeRunner = {
    async query(input: Record<string, unknown>) {
      calls.push({ tool: 'query', input });
      queryCount += 1;
      if (queryCount === 1) {
        return {
          candidates: [{ name: 'FallbackCandidate' }],
          resource_hints: [{ path: 'Assets/Other/OffTarget.asset' }],
        };
      }
      return {
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [
          {
            path: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          },
        ],
      };
    },
    async context(input: Record<string, unknown>) {
      calls.push({ tool: 'context', input });
      return {
        symbol: { name: 'WeaponPowerUp' },
        incoming: {
          CALLS: [{ name: 'HoldPickup' }, { name: 'EquipWithEvent' }],
        },
        outgoing: {
          CALLS: [{ name: 'PickItUp' }, { name: 'Equip' }],
        },
      };
    },
    async cypher(input: Record<string, unknown>) {
      calls.push({ tool: 'cypher', input });
      return {
        row_count: 2,
        rows: [
          { src: 'HoldPickup', dst: 'PickItUp' },
          { src: 'EquipWithEvent', dst: 'Equip' },
        ],
      };
    },
  };

  const result = await runWorkflowReplay(fakeCase, fakeRunner);
  assert.equal(result.tool_calls_to_completion, 4);
  assert.equal(result.retry_breakdown.query_retry_count, 1);
  assert.equal(result.retry_breakdown.context_retry_count, 0);
  assert.equal(result.semantic_tuple_pass, true);
  assert.equal(result.stop_reason, 'semantic_tuple_satisfied');
  assert.equal(calls.map((entry) => entry.tool).join(','), 'query,query,context,cypher');
});
