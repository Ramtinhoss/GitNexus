import { describe, it, expect } from 'vitest';
import { generateId } from '../../src/lib/utils.js';
import { createKnowledgeGraph } from '../../src/core/graph/graph.js';
import { applyUnityRuntimeBindingRules } from '../../src/core/ingestion/unity-runtime-binding-rules.js';
import type { RuntimeClaimRule } from '../../src/mcp/local/runtime-claim-rule-registry.js';

function makeRule(overrides: Partial<RuntimeClaimRule> = {}): RuntimeClaimRule {
  return {
    id: 'test.scene-load',
    version: '2.0.0',
    trigger_family: 'test',
    resource_types: ['scene'],
    host_base_type: ['MonoBehaviour'],
    required_hops: [],
    guarantees: [],
    non_guarantees: [],
    family: 'analyze_rules',
    file_path: '/fake/test.yaml',
    ...overrides,
  };
}

function buildSceneGraph() {
  const graph = createKnowledgeGraph();

  const sceneFileId = generateId('File', 'Assets/NEON/Scene/Global.unity');
  graph.addNode({
    id: sceneFileId,
    label: 'File',
    properties: { name: 'Global.unity', filePath: 'Assets/NEON/Scene/Global.unity' },
  });

  const globalClassId = generateId('Class', 'Assets/NEON/Code/Framework/Global.cs:Global');
  graph.addNode({
    id: globalClassId,
    label: 'Class',
    properties: { name: 'Global', filePath: 'Assets/NEON/Code/Framework/Global.cs' },
  });

  const initGlobalId = generateId('Method', 'Assets/NEON/Code/Framework/Global.cs:Global.InitGlobal');
  graph.addNode({
    id: initGlobalId,
    label: 'Method',
    properties: { name: 'InitGlobal', filePath: 'Assets/NEON/Code/Framework/Global.cs' },
  });
  graph.addRelationship({
    id: generateId('HAS_METHOD', `${globalClassId}->${initGlobalId}`),
    type: 'HAS_METHOD', sourceId: globalClassId, targetId: initGlobalId, confidence: 1, reason: '',
  });

  const svcClassId = generateId('Class', 'Assets/NEON/Code/Framework/ServiceManager.cs:ServiceManager');
  graph.addNode({
    id: svcClassId,
    label: 'Class',
    properties: { name: 'ServiceManager', filePath: 'Assets/NEON/Code/Framework/ServiceManager.cs' },
  });

  const svcAwakeId = generateId('Method', 'Assets/NEON/Code/Framework/ServiceManager.cs:ServiceManager.Awake');
  graph.addNode({
    id: svcAwakeId,
    label: 'Method',
    properties: { name: 'Awake', filePath: 'Assets/NEON/Code/Framework/ServiceManager.cs' },
  });
  graph.addRelationship({
    id: generateId('HAS_METHOD', `${svcClassId}->${svcAwakeId}`),
    type: 'HAS_METHOD', sourceId: svcClassId, targetId: svcAwakeId, confidence: 1, reason: '',
  });

  graph.addRelationship({
    id: generateId('UNITY_COMPONENT_INSTANCE', `${svcClassId}->${sceneFileId}`),
    type: 'UNITY_COMPONENT_INSTANCE', sourceId: svcClassId, targetId: sceneFileId, confidence: 1, reason: '',
  });

  return { graph, initGlobalId, svcAwakeId };
}

function buildScenePrefabGraph(fieldName: string = 'm_SourcePrefab') {
  const graph = createKnowledgeGraph();

  const scenePath = 'Assets/NEON/Scene/Global.unity';
  const prefabPath = 'Assets/NEON/Prefab/Systems/SystemHub.prefab';

  const sceneFileId = generateId('File', scenePath);
  graph.addNode({
    id: sceneFileId,
    label: 'File',
    properties: { name: 'Global.unity', filePath: scenePath },
  });

  const prefabFileId = generateId('File', prefabPath);
  graph.addNode({
    id: prefabFileId,
    label: 'File',
    properties: { name: 'SystemHub.prefab', filePath: prefabPath },
  });

  const globalClassId = generateId('Class', 'Assets/NEON/Code/Framework/Global.cs:Global');
  graph.addNode({
    id: globalClassId,
    label: 'Class',
    properties: { name: 'Global', filePath: 'Assets/NEON/Code/Framework/Global.cs' },
  });
  const initGlobalId = generateId('Method', 'Assets/NEON/Code/Framework/Global.cs:Global.InitGlobal');
  graph.addNode({
    id: initGlobalId,
    label: 'Method',
    properties: { name: 'InitGlobal', filePath: 'Assets/NEON/Code/Framework/Global.cs' },
  });
  graph.addRelationship({
    id: generateId('HAS_METHOD', `${globalClassId}->${initGlobalId}`),
    type: 'HAS_METHOD', sourceId: globalClassId, targetId: initGlobalId, confidence: 1, reason: '',
  });

  const managerClassId = generateId('Class', 'Assets/NEON/Code/Framework/SystemHubManager.cs:SystemHubManager');
  graph.addNode({
    id: managerClassId,
    label: 'Class',
    properties: { name: 'SystemHubManager', filePath: 'Assets/NEON/Code/Framework/SystemHubManager.cs' },
  });
  const managerStartId = generateId('Method', 'Assets/NEON/Code/Framework/SystemHubManager.cs:SystemHubManager.Start');
  graph.addNode({
    id: managerStartId,
    label: 'Method',
    properties: { name: 'Start', filePath: 'Assets/NEON/Code/Framework/SystemHubManager.cs' },
  });
  graph.addRelationship({
    id: generateId('HAS_METHOD', `${managerClassId}->${managerStartId}`),
    type: 'HAS_METHOD', sourceId: managerClassId, targetId: managerStartId, confidence: 1, reason: '',
  });
  graph.addRelationship({
    id: generateId('UNITY_COMPONENT_INSTANCE', `${managerClassId}->${prefabFileId}`),
    type: 'UNITY_COMPONENT_INSTANCE', sourceId: managerClassId, targetId: prefabFileId, confidence: 1, reason: '',
  });

  graph.addRelationship({
    id: generateId('UNITY_ASSET_GUID_REF', `${sceneFileId}->${prefabFileId}:${fieldName}`),
    type: 'UNITY_ASSET_GUID_REF',
    sourceId: sceneFileId,
    targetId: prefabFileId,
    confidence: 1,
    reason: JSON.stringify({
      resourcePath: scenePath,
      targetResourcePath: prefabPath,
      guid: '40b55cc0dc3df614cba74807b7502af5',
      fieldName,
      sourceLayer: 'scene',
    }),
  });

  return { graph, initGlobalId, managerStartId };
}

describe('method_triggers_scene_load binding processor', () => {
  it('injects CALLS edge from loader to scene component lifecycle', () => {
    const { graph, initGlobalId, svcAwakeId } = buildSceneGraph();

    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake', 'Start', 'OnEnable'],
      }],
    });

    const result = applyUnityRuntimeBindingRules(graph, [rule], {} as any);
    expect(result.edgesInjected).toBe(1);
    expect(result.ruleResults[0].edgesInjected).toBe(1);

    const edges = [...graph.iterRelationships()].filter(
      r => r.type === 'CALLS' && r.reason.startsWith('unity-rule-scene-load:'),
    );
    expect(edges.length).toBe(1);
    expect(edges[0].sourceId).toBe(initGlobalId);
    expect(edges[0].targetId).toBe(svcAwakeId);
  });

  it('injects CALLS edge from loader to prefab component lifecycle via scene m_SourcePrefab chain', () => {
    const { graph, initGlobalId, managerStartId } = buildScenePrefabGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake', 'Start', 'OnEnable'],
      }],
    });

    const result = applyUnityRuntimeBindingRules(graph, [rule], {} as any);
    expect(result.edgesInjected).toBe(1);

    const edges = [...graph.iterRelationships()].filter(
      (r) => r.type === 'CALLS' && r.reason.startsWith('unity-rule-scene-load:'),
    );
    expect(edges.length).toBe(1);
    expect(edges[0].sourceId).toBe(initGlobalId);
    expect(edges[0].targetId).toBe(managerStartId);
  });

  it('does not treat non-m_SourcePrefab refs as scene-instantiated prefab lifecycle targets', () => {
    const { graph } = buildScenePrefabGraph('globalDataAssets');
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake', 'Start', 'OnEnable'],
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });

  it('injects lifecycle edges for nested prefabs reachable from scene m_SourcePrefab chain', () => {
    const { graph, initGlobalId } = buildScenePrefabGraph();
    const rootPrefabId = generateId('File', 'Assets/NEON/Prefab/Systems/SystemHub.prefab');
    const nestedPrefabPath = 'Assets/NEON/Prefab/Systems/SystemHub_Nested.prefab';
    const nestedPrefabId = generateId('File', nestedPrefabPath);
    graph.addNode({
      id: nestedPrefabId,
      label: 'File',
      properties: { name: 'SystemHub_Nested.prefab', filePath: nestedPrefabPath },
    });

    const nestedClassId = generateId('Class', 'Assets/NEON/Code/Framework/NestedHubManager.cs:NestedHubManager');
    graph.addNode({
      id: nestedClassId,
      label: 'Class',
      properties: { name: 'NestedHubManager', filePath: 'Assets/NEON/Code/Framework/NestedHubManager.cs' },
    });
    const nestedAwakeId = generateId('Method', 'Assets/NEON/Code/Framework/NestedHubManager.cs:NestedHubManager.Awake');
    graph.addNode({
      id: nestedAwakeId,
      label: 'Method',
      properties: { name: 'Awake', filePath: 'Assets/NEON/Code/Framework/NestedHubManager.cs' },
    });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${nestedClassId}->${nestedAwakeId}`),
      type: 'HAS_METHOD', sourceId: nestedClassId, targetId: nestedAwakeId, confidence: 1, reason: '',
    });
    graph.addRelationship({
      id: generateId('UNITY_COMPONENT_INSTANCE', `${nestedClassId}->${nestedPrefabId}`),
      type: 'UNITY_COMPONENT_INSTANCE', sourceId: nestedClassId, targetId: nestedPrefabId, confidence: 1, reason: '',
    });
    graph.addRelationship({
      id: generateId('UNITY_ASSET_GUID_REF', `${rootPrefabId}->${nestedPrefabId}:m_SourcePrefab`),
      type: 'UNITY_ASSET_GUID_REF',
      sourceId: rootPrefabId,
      targetId: nestedPrefabId,
      confidence: 1,
      reason: JSON.stringify({
        resourcePath: 'Assets/NEON/Prefab/Systems/SystemHub.prefab',
        targetResourcePath: nestedPrefabPath,
        guid: '11111111111111111111111111111111',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'prefab',
      }),
    });

    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake', 'Start', 'OnEnable'],
      }],
    });

    const result = applyUnityRuntimeBindingRules(graph, [rule], {} as any);
    expect(result.edgesInjected).toBe(2);
    const edges = [...graph.iterRelationships()].filter(
      (r) => r.type === 'CALLS' && r.reason.startsWith('unity-rule-scene-load:'),
    );
    const edgeTargets = new Set(edges.map((edge) => edge.targetId));
    expect(edges.every((edge) => edge.sourceId === initGlobalId)).toBe(true);
    expect(edgeTargets.has(nestedAwakeId)).toBe(true);
  });

  it('no edges when scene_name does not match any File node', () => {
    const { graph } = buildSceneGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'NonExistentScene',
        target_entry_points: ['Awake'],
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });

  it('emits diagnostics with shouldAgentReport=false when no anomaly exists', () => {
    const { graph } = buildSceneGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake'],
      }],
    });
    const result = applyUnityRuntimeBindingRules(graph, [rule], {} as any);
    expect(result.diagnostics.shouldAgentReport).toBe(false);
    expect(result.diagnostics.anomalies.length).toBe(0);
    expect(result.diagnostics.summary.some((line) => line.includes('rule_binding.agent_report: should_report=false'))).toBe(true);
  });

  it('emits diagnostics with shouldAgentReport=true when scene file cannot be resolved', () => {
    const { graph } = buildSceneGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'MissingScene',
        target_entry_points: ['Awake'],
      }],
    });
    const result = applyUnityRuntimeBindingRules(graph, [rule], {} as any);
    expect(result.edgesInjected).toBe(0);
    expect(result.diagnostics.shouldAgentReport).toBe(true);
    expect(result.diagnostics.anomalies.some((line) => line.includes('scene "MissingScene" not found'))).toBe(true);
    expect(result.diagnostics.summary.some((line) => line.includes('rule_binding.agent_report: should_report=true'))).toBe(true);
  });

  it('no edges when no .unity File node exists in graph', () => {
    const graph = createKnowledgeGraph();
    const classId = generateId('Class', 'Foo.cs:Global');
    graph.addNode({ id: classId, label: 'Class', properties: { name: 'Global', filePath: 'Foo.cs' } });
    const methodId = generateId('Method', 'Foo.cs:Global.InitGlobal');
    graph.addNode({ id: methodId, label: 'Method', properties: { name: 'InitGlobal', filePath: 'Foo.cs' } });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${classId}->${methodId}`),
      type: 'HAS_METHOD', sourceId: classId, targetId: methodId, confidence: 1, reason: '',
    });
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        scene_name: 'Global',
        target_entry_points: ['Awake'],
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });

  it('no edges when scene_name is missing from binding', () => {
    const { graph } = buildSceneGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_scene_load',
        host_class_pattern: '^Global$',
        loader_methods: ['InitGlobal'],
        target_entry_points: ['Awake'],
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });
});

describe('method_triggers_method binding processor', () => {
  function buildMethodGraph() {
    const graph = createKnowledgeGraph();

    const playerClassId = generateId('Class', 'PlayerActor.cs:PlayerActor');
    graph.addNode({
      id: playerClassId,
      label: 'Class',
      properties: { name: 'PlayerActor', filePath: 'Assets/NEON/Code/Game/Actors/PlayerActor.cs' },
    });
    const processId = generateId('Method', 'PlayerActor.cs:PlayerActor.ProcessInteractables');
    graph.addNode({
      id: processId,
      label: 'Method',
      properties: { name: 'ProcessInteractables', filePath: 'PlayerActor.cs' },
    });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${playerClassId}->${processId}`),
      type: 'HAS_METHOD', sourceId: playerClassId, targetId: processId, confidence: 1, reason: '',
    });

    const netPlayerClassId = generateId('Class', 'NetPlayer.cs:NetPlayer');
    graph.addNode({
      id: netPlayerClassId,
      label: 'Class',
      properties: { name: 'NetPlayer', filePath: 'Assets/NEON/Code/NetworkCode/NetPlayer.cs' },
    });
    const onClientPickItUpId = generateId('Method', 'NetPlayer.cs:NetPlayer.OnClientPickItUp');
    graph.addNode({
      id: onClientPickItUpId,
      label: 'Method',
      properties: { name: 'OnClientPickItUp', filePath: 'NetPlayer.cs' },
    });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${netPlayerClassId}->${onClientPickItUpId}`),
      type: 'HAS_METHOD', sourceId: netPlayerClassId, targetId: onClientPickItUpId, confidence: 1, reason: '',
    });

    return { graph, processId, onClientPickItUpId };
  }

  it('injects CALLS edge from source method to target method', () => {
    const { graph, processId, onClientPickItUpId } = buildMethodGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_method',
        source_class_pattern: '^PlayerActor$',
        source_method: 'ProcessInteractables',
        target_class_pattern: '^NetPlayer$',
        target_method: 'OnClientPickItUp',
      }],
    });

    const result = applyUnityRuntimeBindingRules(graph, [rule], {} as any);
    expect(result.edgesInjected).toBe(1);

    const edges = [...graph.iterRelationships()].filter(
      r => r.type === 'CALLS' && r.reason.startsWith('unity-rule-method-bridge:'),
    );
    expect(edges.length).toBe(1);
    expect(edges[0].sourceId).toBe(processId);
    expect(edges[0].targetId).toBe(onClientPickItUpId);
  });

  it('no edges when source class does not exist', () => {
    const { graph } = buildMethodGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_method',
        source_class_pattern: '^NonExistentClass$',
        source_method: 'ProcessInteractables',
        target_class_pattern: '^NetPlayer$',
        target_method: 'OnClientPickItUp',
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });

  it('no edges when target method does not exist', () => {
    const { graph } = buildMethodGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_method',
        source_class_pattern: '^PlayerActor$',
        source_method: 'ProcessInteractables',
        target_class_pattern: '^NetPlayer$',
        target_method: 'NonExistentMethod',
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });

  it('no edges when source_class_pattern is missing', () => {
    const { graph } = buildMethodGraph();
    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_method',
        source_method: 'ProcessInteractables',
        target_class_pattern: '^NetPlayer$',
        target_method: 'OnClientPickItUp',
      }],
    });
    expect(applyUnityRuntimeBindingRules(graph, [rule], {} as any).edgesInjected).toBe(0);
  });
});

describe('container node gate for runtime bindings', () => {
  function buildStructTargetGraph() {
    const graph = createKnowledgeGraph();

    const sourceClassId = generateId('Class', 'PlayerActor.cs:PlayerActor');
    graph.addNode({
      id: sourceClassId,
      label: 'Class',
      properties: { name: 'PlayerActor', filePath: 'Assets/NEON/Code/Game/Actors/PlayerActor.cs' },
    });
    const sourceMethodId = generateId('Method', 'PlayerActor.cs:PlayerActor.ProcessInteractables');
    graph.addNode({
      id: sourceMethodId,
      label: 'Method',
      properties: { name: 'ProcessInteractables', filePath: 'PlayerActor.cs' },
    });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${sourceClassId}->${sourceMethodId}`),
      type: 'HAS_METHOD', sourceId: sourceClassId, targetId: sourceMethodId, confidence: 1, reason: '',
    });

    const targetStructId = generateId('Struct', 'NetPlayerState.cs:NetPlayerState');
    graph.addNode({
      id: targetStructId,
      label: 'Struct',
      properties: { name: 'NetPlayerState', filePath: 'Assets/NEON/Code/NetworkCode/NetPlayerState.cs' },
    });
    const targetMethodId = generateId('Method', 'NetPlayerState.cs:NetPlayerState.OnClientPickItUp');
    graph.addNode({
      id: targetMethodId,
      label: 'Method',
      properties: { name: 'OnClientPickItUp', filePath: 'NetPlayerState.cs' },
    });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${targetStructId}->${targetMethodId}`),
      type: 'HAS_METHOD', sourceId: targetStructId, targetId: targetMethodId, confidence: 1, reason: '',
    });

    const rule = makeRule({
      resource_bindings: [{
        kind: 'method_triggers_method',
        source_class_pattern: '^PlayerActor$',
        source_method: 'ProcessInteractables',
        target_class_pattern: '^NetPlayerState$',
        target_method: 'OnClientPickItUp',
      }],
    });

    return { graph, rule, sourceMethodId, targetMethodId };
  }

  it('keeps baseline behavior when enableContainerNodes=false', () => {
    const { graph, rule } = buildStructTargetGraph();
    const result = applyUnityRuntimeBindingRules(graph, [rule], { enableContainerNodes: false } as any);
    expect(result.edgesInjected).toBe(0);
  });

  it('matches struct/interface containers when enableContainerNodes=true', () => {
    const { graph, rule, sourceMethodId, targetMethodId } = buildStructTargetGraph();
    const result = applyUnityRuntimeBindingRules(graph, [rule], { enableContainerNodes: true } as any);
    expect(result.edgesInjected).toBe(1);

    const edges = [...graph.iterRelationships()].filter(
      (edge) => edge.type === 'CALLS' && edge.reason.startsWith('unity-rule-method-bridge:'),
    );
    expect(edges.length).toBe(1);
    expect(edges[0].sourceId).toBe(sourceMethodId);
    expect(edges[0].targetId).toBe(targetMethodId);
  });
});
