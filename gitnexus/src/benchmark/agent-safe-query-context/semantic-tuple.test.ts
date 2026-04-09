import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreLiveTuple, semanticTuplePass } from './semantic-tuple.js';
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

test('scoreLiveTuple normalizes fully-qualified symbol identity to canonical anchor', () => {
  const expected: SemanticTuple = {
    resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
    symbol_anchor: 'ReloadBase',
    proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
    closure_status: 'not_verified_full',
  };

  const score = scoreLiveTuple(
    expected,
    {
      resource_anchor: expected.resource_anchor,
      symbol_anchor: 'Game.Runtime.ReloadBase',
      proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
      closure_status: 'not_verified_full',
    },
    [
      { text: expected.resource_anchor },
      { symbol: 'ReloadBase' },
      { src: 'GetValue', dst: 'CheckReload' },
    ],
  );

  assert.equal(score.normalized_tuple.symbol_anchor, 'ReloadBase');
  assert.equal(score.normalized_tuple_pass, true);
  assert.equal(score.evidence_validation_pass, true);
});

test('scoreLiveTuple normalizes caller/callee objects to canonical proof edges', () => {
  const expected: SemanticTuple = {
    resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
    symbol_anchor: 'WeaponPowerUp',
    proof_edges: [
      'HoldPickup -> WeaponPowerUp.PickItUp',
      'EquipWithEvent -> WeaponPowerUp.Equip',
    ],
    closure_status: 'not_verified_full',
  };

  const score = scoreLiveTuple(
    expected,
    {
      resource_anchor: expected.resource_anchor,
      symbol_anchor: expected.symbol_anchor,
      proof_edges: [
        { caller: 'HoldPickup', callee: 'WeaponPowerUp.PickItUp' },
        { caller: 'EquipWithEvent', callee: 'WeaponPowerUp.Equip' },
      ],
      closure_status: 'not_verified_full',
    },
    [
      { value: expected.resource_anchor },
      { symbol: 'WeaponPowerUp' },
      { src: 'HoldPickup', dst: 'PickItUp' },
      { src: 'EquipWithEvent', dst: 'Equip' },
    ],
  );

  assert.equal(score.normalized_tuple_pass, true);
  assert.equal(score.evidence_validation_pass, true);
});

test('scoreLiveTuple classifies evidence_missing when normalized tuple passes without telemetry evidence', () => {
  const expected: SemanticTuple = {
    resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
    symbol_anchor: 'ReloadBase',
    proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
    closure_status: 'not_verified_full',
  };

  const score = scoreLiveTuple(
    expected,
    {
      resource_anchor: expected.resource_anchor,
      symbol_anchor: expected.symbol_anchor,
      proof_edge: expected.proof_edge,
      closure_status: 'not_verified_full',
    },
    [{ output: 'no reload edge evidence here' }],
  );

  assert.equal(score.normalized_tuple_pass, true);
  assert.equal(score.evidence_validation_pass, false);
  assert.equal(score.failure_class, 'evidence_missing');
});

test('scoreLiveTuple emits semantic_drift, expression_mismatch, and over_investigated failure classes', () => {
  const expected: SemanticTuple = {
    resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
    symbol_anchor: 'WeaponPowerUp',
    proof_edges: [
      'HoldPickup -> WeaponPowerUp.PickItUp',
      'EquipWithEvent -> WeaponPowerUp.Equip',
    ],
    closure_status: 'not_verified_full',
  };

  const semanticDrift = scoreLiveTuple(
    expected,
    {
      resource_anchor: expected.resource_anchor,
      symbol_anchor: 'WrongSymbol',
      proof_edges: [{ caller: 'HoldPickup', callee: 'WeaponPowerUp.PickItUp' }],
    },
    [],
  );
  assert.equal(semanticDrift.failure_class, 'semantic_drift');

  const expressionMismatch = scoreLiveTuple(
    expected,
    {
      resource_anchor: expected.resource_anchor,
      symbol_anchor: expected.symbol_anchor,
      proof_edges: [{ caller: 'HoldPickup', callee: 'WeaponPowerUp.NotEquip' }],
    },
    [],
  );
  assert.equal(expressionMismatch.failure_class, 'expression_mismatch');

  const overInvestigated = scoreLiveTuple(
    expected,
    {
      resource_anchor: expected.resource_anchor,
      symbol_anchor: expected.symbol_anchor,
      proof_edges: [{ caller: 'HoldPickup', callee: 'WeaponPowerUp.NotEquip' }],
    },
    [],
    { toolCalls: 8, overInvestigatedThreshold: 6 },
  );
  assert.equal(overInvestigated.failure_class, 'over_investigated');
});
