import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadAgentSafeQueryContextSuite } from './io.js';

test('loads canonical benchmark cases without placeholders', async () => {
  const suite = await loadAgentSafeQueryContextSuite(
    path.resolve('../benchmarks/agent-safe-query-context/neonspark-v1'),
  );

  assert.deepEqual(Object.keys(suite.cases).sort(), ['reload', 'weapon_powerup']);
  assert.equal(
    suite.cases.weapon_powerup.semantic_tuple.resource_anchor,
    'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
  );
  assert.equal(
    suite.cases.reload.semantic_tuple.proof_edge,
    'ReloadBase.GetValue -> ReloadBase.CheckReload',
  );
  assert.equal(suite.cases.weapon_powerup.live_task.symbol_seed, 'WeaponPowerUp');
  assert.equal(
    suite.cases.reload.live_task.resource_seed,
    'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
  );
  assert.equal(
    suite.cases.weapon_powerup.live_task.objective.includes('HoldPickup -> WeaponPowerUp.PickItUp'),
    false,
  );
});
