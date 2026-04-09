import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticTuplePass } from './semantic-tuple.js';
import type { SemanticTuple } from './types.js';

test('semanticTuplePass returns true for identical tuples', () => {
  const tuple: SemanticTuple = {
    resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
    symbol_anchor: 'WeaponPowerUp',
    proof_edges: [
      'HoldPickup -> WeaponPowerUp.PickItUp',
      'EquipWithEvent -> WeaponPowerUp.Equip',
    ],
    closure_status: 'not_verified_full',
  };

  assert.equal(semanticTuplePass(tuple, tuple), true);
});

test('semanticTuplePass returns false when any tuple field differs', () => {
  const left: SemanticTuple = {
    resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
    symbol_anchor: 'ReloadBase',
    proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
    closure_status: 'not_verified_full',
  };
  const right: SemanticTuple = {
    ...left,
    proof_edge: 'ReloadBase.GetValue -> ReloadBase.ReloadRoutine',
  };

  assert.equal(semanticTuplePass(left, right), false);
});
