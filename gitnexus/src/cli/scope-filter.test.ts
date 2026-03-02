import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScopeRules, pathMatchesScopeRules } from '../core/ingestion/scope-filter.js';

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
