import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

function collectKindValues(bindingSchema: any): string[] {
  if (Array.isArray(bindingSchema?.properties?.kind?.enum)) {
    return [...bindingSchema.properties.kind.enum];
  }
  if (Array.isArray(bindingSchema?.oneOf)) {
    const kinds = bindingSchema.oneOf
      .map((entry: any) => String(entry?.properties?.kind?.const || '').trim())
      .filter(Boolean);
    return [...new Set(kinds)];
  }
  return [];
}

function collectBindingProps(bindingSchema: any): string[] {
  const top = Object.keys(bindingSchema?.properties || {});
  const variants = Array.isArray(bindingSchema?.oneOf)
    ? bindingSchema.oneOf.flatMap((entry: any) => Object.keys(entry?.properties || {}))
    : [];
  return [...new Set([...top, ...variants])];
}

async function loadRuleDslSchema(): Promise<any> {
  const schemaUrl = new URL('../../src/rule-lab/schema/rule-dsl.schema.json', import.meta.url);
  const raw = await fs.readFile(fileURLToPath(schemaUrl), 'utf-8');
  return JSON.parse(raw);
}

function makeRule(binding: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'unity.test.rule.v1',
    version: '2.0.0',
    match: {
      trigger_tokens: ['InitGlobal'],
    },
    topology: [
      {
        hop: 'resource',
        from: { entity: 'resource' },
        to: { entity: 'script' },
        edge: { kind: 'binds_script' },
      },
    ],
    closure: {
      required_hops: ['resource'],
      failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
    },
    claims: {
      guarantees: ['runtime_chain_anchor_present'],
      non_guarantees: ['no_runtime_execution'],
      next_action: 'gitnexus query "InitGlobal"',
    },
    resource_bindings: [binding],
  };
}

describe('rule-dsl schema resource_bindings parity', () => {
  it('includes all executable resource binding kinds and field surface', async () => {
    const schema = await loadRuleDslSchema();
    const bindingSchema = schema?.properties?.resource_bindings?.items;
    const enumValues = collectKindValues(bindingSchema);

    expect(enumValues).toEqual([
      'asset_ref_loads_components',
      'method_triggers_field_load',
      'method_triggers_scene_load',
      'method_triggers_method',
    ]);

    const kindProps = collectBindingProps(bindingSchema);
    expect(kindProps).toContain('scene_name');
    expect(kindProps).toContain('source_class_pattern');
    expect(kindProps).toContain('source_method');
    expect(kindProps).toContain('target_class_pattern');
    expect(kindProps).toContain('target_method');
  });

  it('validates method_triggers_scene_load and method_triggers_method samples', async () => {
    const schema = await loadRuleDslSchema();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);

    const validMethodTriggersSceneLoadRule = makeRule({
      kind: 'method_triggers_scene_load',
      host_class_pattern: '^Global$',
      loader_methods: ['InitGlobal'],
      scene_name: 'Global',
      target_entry_points: ['Awake', 'Start'],
    });
    expect(validate(validMethodTriggersSceneLoadRule)).toBe(true);

    const validMethodTriggersMethodRule = makeRule({
      kind: 'method_triggers_method',
      source_class_pattern: 'PlayerActor',
      source_method: 'HoldPickup',
      target_class_pattern: 'WeaponPowerUp',
      target_method: 'PickItUp',
    });
    expect(validate(validMethodTriggersMethodRule)).toBe(true);

    const invalidMethodTriggersSceneLoadRuleMissingSceneName = makeRule({
      kind: 'method_triggers_scene_load',
      host_class_pattern: '^Global$',
      loader_methods: ['InitGlobal'],
      target_entry_points: ['Awake', 'Start'],
    });
    expect(validate(invalidMethodTriggersSceneLoadRuleMissingSceneName)).toBe(false);

    const invalidMethodTriggersMethodRuleMissingTargetMethod = makeRule({
      kind: 'method_triggers_method',
      source_class_pattern: 'PlayerActor',
      source_method: 'HoldPickup',
      target_class_pattern: 'WeaponPowerUp',
    });
    expect(validate(invalidMethodTriggersMethodRuleMissingTargetMethod)).toBe(false);
  });
});
