import assert from 'node:assert/strict';
import { test } from 'vitest';
import { RuleRegistryLoadError, parseRuleYaml } from './runtime-claim-rule-registry.js';

test('RuleRegistryLoadError has code and context', () => {
  const err = new RuleRegistryLoadError(
    'rule_catalog_missing',
    'Catalog not found',
    { repoPath: '/tmp/repo' },
  );
  assert.ok(err instanceof RuleRegistryLoadError);
  assert.equal(err.code, 'rule_catalog_missing');
  assert.match(String(err.message || ''), /Catalog not found/);
});

test('parseRuleYaml parses basic fields', () => {
  const yaml = [
    'id: demo.reload.rule.v1',
    'version: 1.2.3',
    'trigger_family: reload',
    'resource_types:',
    '  - asset',
    'host_base_type:',
    '  - ReloadBase',
    'required_hops:',
    '  - resource',
    'guarantees:',
    '  - reload_chain_closed',
    'non_guarantees:',
    '  - no_runtime_execution',
    'next_action: gitnexus query "reload"',
    'match:',
    '  trigger_tokens:',
    '    - reload',
    'closure:',
    '  required_hops:',
    '    - resource',
    'claims:',
    '  guarantees:',
    '    - reload_chain_closed',
    '  non_guarantees:',
    '    - no_runtime_execution',
    '  next_action: gitnexus query "reload"',
    'topology:',
    '  - hop: resource',
    '    from:',
    '      entity: resource',
    '    to:',
    '      entity: script',
    '    edge:',
    '      kind: binds_script',
  ].join('\n');

  const rule = parseRuleYaml(yaml, 'test.yaml');
  assert.equal(rule.id, 'demo.reload.rule.v1');
  assert.equal(rule.version, '1.2.3');
  assert.equal(rule.trigger_family, 'reload');
  assert.deepEqual(rule.resource_types, ['asset']);
  assert.deepEqual(rule.host_base_type, ['ReloadBase']);
  assert.equal(rule.file_path, 'test.yaml');
});

test('parseRuleYaml parses scalar/list values with spaces, quotes, and escapes', () => {
  const yaml = [
    'id: demo.scalar-parser.v1',
    'version: 1.0.0',
    'trigger_family: reload',
    'resource_types:',
    '  - "asset ref"',
    "  - 'prefab ref'",
    'host_base_type:',
    "  - 'ReloadBase'",
    'required_hops:',
    '  - resource',
    'guarantees:',
    "  - 'guarantee with spaces'",
    'non_guarantees:',
    '  - "double-quote \\"inside\\""',
    "  - 'single-quote ''inside'''",
    'next_action: node gitnexus/dist/cli/index.js query --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"',
    'match:',
    '  trigger_tokens:',
    '    - reload',
    'closure:',
    '  required_hops:',
    '    - resource',
    'claims:',
    '  guarantees:',
    "    - 'guarantee with spaces'",
    '  non_guarantees:',
    '    - "double-quote \\"inside\\""',
    "    - 'single-quote ''inside'''",
    '  next_action: query "reload"',
    'topology:',
    '  - hop: resource',
    '    from:',
    '      entity: resource',
    '    to:',
    '      entity: script',
    '    edge:',
    '      kind: binds_script',
  ].join('\n');

  const rule = parseRuleYaml(yaml, 'scalar.yaml');
  assert.equal(rule.id, 'demo.scalar-parser.v1');
  assert.deepEqual(rule.resource_types, ['asset ref', 'prefab ref']);
  assert.deepEqual(rule.guarantees, ['guarantee with spaces']);
  assert.deepEqual(rule.non_guarantees, ['double-quote "inside"', "single-quote 'inside'"]);
  assert.equal(
    rule.next_action,
    'query "reload"',
  );
});
