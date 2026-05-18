import { describe, it, expect } from 'vitest';
import { parseRuleYaml } from '../../src/mcp/local/runtime-claim-rule-registry.js';

describe('parseRuleYaml', () => {
  it('parses basic rule fields', () => {
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
`.trim();

    const result = parseRuleYaml(yaml, '/test/rule.yaml');
    expect(result.id).toBe('test-rule-001');
    expect(result.version).toBe('1.0');
    expect(result.trigger_family).toBe('asset_load');
    expect(result.resource_types).toEqual(['Prefab']);
    expect(result.host_base_type).toEqual(['MonoBehaviour']);
    expect(result.required_hops).toEqual(['field_ref']);
    expect(result.guarantees).toEqual(['components_loaded']);
    expect(result.non_guarantees).toEqual(['runtime_order']);
    expect(result.next_action).toBe('verify_load');
  });
});
