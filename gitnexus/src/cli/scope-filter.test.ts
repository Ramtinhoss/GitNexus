import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScopeRules, pathMatchesScopeRules, selectEntriesByScopeRules } from '../core/ingestion/scope-filter.js';

test('parseScopeRules ignores comments and blank lines', () => {
  const rules = parseScopeRules(`
# comment
Assets/NEON/Code

Packages/com.veewo.*
  Packages/com.neonspark.*
`);
  assert.deepEqual(rules, [
    'Assets/NEON/Code',
    'Packages/com.veewo.*',
    'Packages/com.neonspark.*',
  ]);
});

test('pathMatchesScopeRules supports wildcard and descendant semantics', () => {
  const rules = ['Assets/NEON/Code', 'Packages/com.veewo.*'];
  assert.equal(pathMatchesScopeRules('Assets/NEON/Code/Game/A.cs', rules), true);
  assert.equal(pathMatchesScopeRules('Assets/NEON/Code', rules), true);
  assert.equal(pathMatchesScopeRules('Packages/com.veewo.stat/Runtime/Stat.cs', rules), true);
  assert.equal(pathMatchesScopeRules('Packages/com.unity.inputsystem/Runtime/X.cs', rules), false);
});

test('selectEntriesByScopeRules reports overlap dedupe and normalized path collisions', () => {
  const entries = [
    { path: 'Assets/NEON/Code/Game/A.cs' },
    { path: 'Packages/com.veewo.stat/Runtime/Stat.cs' },
    { path: 'Packages\\com.veewo.stat\\Runtime\\Stat.cs' },
    { path: 'Packages/com.unity.inputsystem/Runtime/X.cs' },
  ];

  const result = selectEntriesByScopeRules(entries, [
    'Assets/NEON/Code',
    'Assets/NEON/*',
    'Packages/com.veewo.*',
  ]);

  assert.equal(result.selected.length, 3);
  assert.equal(result.diagnostics.appliedRuleCount, 3);
  assert.equal(result.diagnostics.overlapFiles, 1);
  assert.equal(result.diagnostics.dedupedMatchCount, 1);
  assert.equal(result.diagnostics.normalizedCollisions.length, 1);
  assert.deepEqual(result.diagnostics.normalizedCollisions[0], {
    normalizedPath: 'Packages/com.veewo.stat/Runtime/Stat.cs',
    paths: [
      'Packages/com.veewo.stat/Runtime/Stat.cs',
      'Packages\\com.veewo.stat\\Runtime\\Stat.cs',
    ],
  });
});
