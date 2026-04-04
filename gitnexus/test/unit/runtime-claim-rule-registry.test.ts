import { describe, it, expect } from 'vitest';
import { parseRuleYaml } from '../../src/mcp/local/runtime-claim-rule-registry.js';

describe('parseRuleYaml', () => {
  it('parses resource_bindings and lifecycle_overrides', () => {
    const yaml = `
id: test-rule-001
version: "1.0"
trigger_family: asset_load
resource_types:
  - Prefab
host_base_type:
  - MonoBehaviour
required_hops:
  - field_ref
guarantees:
  - components_loaded
non_guarantees:
  - runtime_order
next_action: verify_load
resource_bindings:
  - kind: asset_ref_loads_components
    ref_field_pattern: ".*Ref$"
    target_entry_points:
      - OnLoadComplete
      - OnAssetReady
  - kind: method_triggers_field_load
    host_class_pattern: ".*Manager"
    field_name: _cachedAsset
    loader_methods:
      - LoadAsync
      - LoadSync
lifecycle_overrides:
  additional_entry_points:
    - OnEnable
    - OnSpawn
  scope: scene
`.trim();

    const result = parseRuleYaml(yaml, '/test/rule.yaml');

    expect(result.resource_bindings).toHaveLength(2);

    const rb0 = result.resource_bindings![0];
    expect(rb0.kind).toBe('asset_ref_loads_components');
    expect(rb0.ref_field_pattern).toBe('.*Ref$');
    expect(rb0.target_entry_points).toEqual(['OnLoadComplete', 'OnAssetReady']);
    expect(rb0.host_class_pattern).toBeUndefined();
    expect(rb0.field_name).toBeUndefined();
    expect(rb0.loader_methods).toBeUndefined();

    const rb1 = result.resource_bindings![1];
    expect(rb1.kind).toBe('method_triggers_field_load');
    expect(rb1.host_class_pattern).toBe('.*Manager');
    expect(rb1.field_name).toBe('_cachedAsset');
    expect(rb1.loader_methods).toEqual(['LoadAsync', 'LoadSync']);
    expect(rb1.ref_field_pattern).toBeUndefined();
    expect(rb1.target_entry_points).toBeUndefined();

    expect(result.lifecycle_overrides).toEqual({
      additional_entry_points: ['OnEnable', 'OnSpawn'],
      scope: 'scene',
    });
  });

  it('returns undefined for resource_bindings and lifecycle_overrides when absent', () => {
    const yaml = `
id: test-rule-002
version: "1.0"
trigger_family: simple
resource_types:
  - Script
host_base_type:
  - Component
required_hops:
  - call
guarantees:
  - reachable
non_guarantees:
  - order
next_action: done
`.trim();

    const result = parseRuleYaml(yaml, '/test/simple.yaml');

    expect(result.resource_bindings).toBeUndefined();
    expect(result.lifecycle_overrides).toBeUndefined();
    expect(result.id).toBe('test-rule-002');
  });
});

describe('parseRuleYaml – method_triggers_scene_load', () => {
  const SCENE_LOAD_YAML = `
id: test.scene-load
version: 2.0.0
family: analyze_rules
trigger_family: test_family
resource_types:
  - scene
host_base_type:
  - MonoBehaviour

match:
  trigger_tokens:
    - Global

topology:
  - hop: resource
    from:
      entity: resource
    to:
      entity: guid
    edge:
      kind: references

closure:
  required_hops:
    - resource
  failure_map:
    missing_evidence: rule_matched_but_evidence_missing

claims:
  guarantees:
    - test_guarantee
  non_guarantees:
    - no_runtime_proof
  next_action: gitnexus query "Global"

resource_bindings:
  - kind: method_triggers_scene_load
    host_class_pattern: "^Global$"
    loader_methods:
      - InitGlobal
    scene_name: "Global"
    target_entry_points:
      - Awake
      - Start
      - OnEnable
`.trim();

  it('parses scene_name field', () => {
    const rule = parseRuleYaml(SCENE_LOAD_YAML, '/fake/path/test.yaml');
    expect(rule.resource_bindings).toBeDefined();
    expect(rule.resource_bindings!.length).toBe(1);
    const binding = rule.resource_bindings![0];
    expect(binding.kind).toBe('method_triggers_scene_load');
    expect(binding.scene_name).toBe('Global');
    expect(binding.loader_methods).toEqual(['InitGlobal']);
    expect(binding.target_entry_points).toEqual(['Awake', 'Start', 'OnEnable']);
    expect(binding.host_class_pattern).toBe('^Global$');
  });

  it('scene_name is undefined when not present', () => {
    const yaml = SCENE_LOAD_YAML.replace(/    scene_name: "Global"\n/, '');
    const rule = parseRuleYaml(yaml, '/fake/path/test.yaml');
    expect(rule.resource_bindings![0].scene_name).toBeUndefined();
  });
});
