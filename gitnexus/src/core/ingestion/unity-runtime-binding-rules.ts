import type { KnowledgeGraph, GraphNode, GraphRelationship } from '../graph/types.js';
import type { RuntimeClaimRule } from '../../mcp/local/runtime-claim-rule-registry.js';
import type { UnityConfig } from '../config/unity-config.js';
import type { UnityResourceBinding } from '../../rule-lab/types.js';
import { generateId } from '../../lib/utils.js';

export interface UnityRuntimeBindingResult {
  edgesInjected: number;
  ruleResults: Array<{ ruleId: string; edgesInjected: number }>;
}

const RULE_EDGE_CONFIDENCE = 0.75;

export function applyUnityRuntimeBindingRules(
  graph: KnowledgeGraph,
  rules: RuntimeClaimRule[],
  config: UnityConfig,
): UnityRuntimeBindingResult {
  const ruleResults: UnityRuntimeBindingResult['ruleResults'] = [];
  let totalEdges = 0;

  const existingPairs = new Set<string>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type === 'CALLS') existingPairs.add(`${rel.sourceId}->${rel.targetId}`);
  }

  const addSyntheticEdge = (sourceId: string, targetId: string, reason: string): boolean => {
    if (sourceId === targetId) return false;
    const key = `${sourceId}->${targetId}`;
    if (existingPairs.has(key)) return false;
    graph.addRelationship({
      id: generateId('CALLS', `${sourceId}->${targetId}:${reason}`),
      sourceId,
      targetId,
      type: 'CALLS',
      confidence: RULE_EDGE_CONFIDENCE,
      reason,
    });
    existingPairs.add(key);
    return true;
  };

  // Pre-build indexes
  const methodsByClassId = new Map<string, GraphNode[]>();
  const containerNodes: GraphNode[] = [];
  const containerLabels = config.enableContainerNodes
    ? new Set(['Class', 'Struct', 'Interface', 'Record'])
    : new Set(['Class']);

  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'HAS_METHOD') continue;
    const method = graph.getNode(rel.targetId);
    if (!method || (method.label !== 'Method' && method.label !== 'Function')) continue;
    const list = methodsByClassId.get(rel.sourceId) ?? [];
    list.push(method);
    methodsByClassId.set(rel.sourceId, list);
  }

  for (const node of graph.iterNodes()) {
    if (containerLabels.has(node.label)) containerNodes.push(node);
  }

  // Collect UNITY_ASSET_GUID_REF and UNITY_COMPONENT_INSTANCE edges
  const assetGuidRefs: GraphRelationship[] = [];
  const componentInstances: GraphRelationship[] = [];
  for (const rel of graph.iterRelationships()) {
    if (rel.type === 'UNITY_ASSET_GUID_REF') assetGuidRefs.push(rel);
    else if (rel.type === 'UNITY_COMPONENT_INSTANCE') componentInstances.push(rel);
  }

  // Pre-build scene file index: lowercase scene name → fileId[]
  const sceneFilesByName = new Map<string, string[]>();
  for (const node of graph.iterNodes()) {
    if (node.label !== 'File') continue;
    const filePath = String(node.properties.filePath ?? '');
    if (!filePath.endsWith('.unity')) continue;
    const fileName = (filePath.split('/').pop() ?? '').replace(/\.unity$/, '').toLowerCase();
    const list = sceneFilesByName.get(fileName) ?? [];
    list.push(node.id);
    sceneFilesByName.set(fileName, list);
  }

  for (const rule of rules) {
    let ruleEdges = 0;
    for (const binding of rule.resource_bindings ?? []) {
      ruleEdges += processBinding(binding, rule.id, assetGuidRefs, componentInstances, methodsByClassId, containerNodes, sceneFilesByName, addSyntheticEdge);
    }
    if (rule.lifecycle_overrides?.additional_entry_points?.length) {
      ruleEdges += processLifecycleOverrides(rule, methodsByClassId, containerNodes, addSyntheticEdge);
    }
    totalEdges += ruleEdges;
    ruleResults.push({ ruleId: rule.id, edgesInjected: ruleEdges });
  }

  return { edgesInjected: totalEdges, ruleResults };
}

function findMethodsOnResource(
  resourceFileId: string,
  componentInstances: GraphRelationship[],
  methodsByClassId: Map<string, GraphNode[]>,
  entryPoints: string[],
): GraphNode[] {
  const results: GraphNode[] = [];
  const entrySet = new Set(entryPoints);
  for (const ci of componentInstances) {
    if (ci.targetId !== resourceFileId) continue;
    const classId = ci.sourceId;
    for (const method of methodsByClassId.get(classId) ?? []) {
      if (entrySet.has(method.properties.name)) results.push(method);
    }
  }
  return results;
}

function processBinding(
  binding: UnityResourceBinding,
  ruleId: string,
  assetGuidRefs: GraphRelationship[],
  componentInstances: GraphRelationship[],
  methodsByClassId: Map<string, GraphNode[]>,
  containerNodes: GraphNode[],
  sceneFilesByName: Map<string, string[]>,
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  if (binding.kind === 'asset_ref_loads_components') {
    return processAssetRefLoadsComponents(binding, ruleId, assetGuidRefs, componentInstances, methodsByClassId, addEdge);
  }
  if (binding.kind === 'method_triggers_field_load') {
    return processMethodTriggersFieldLoad(binding, ruleId, assetGuidRefs, componentInstances, methodsByClassId, containerNodes, addEdge);
  }
  if (binding.kind === 'method_triggers_scene_load') {
    return processMethodTriggersSceneLoad(binding, ruleId, componentInstances, methodsByClassId, containerNodes, sceneFilesByName, addEdge);
  }
  if (binding.kind === 'method_triggers_method') {
    return processMethodTriggersMethod(binding, ruleId, methodsByClassId, containerNodes, addEdge);
  }
  return 0;
}

function processAssetRefLoadsComponents(
  binding: UnityResourceBinding,
  ruleId: string,
  assetGuidRefs: GraphRelationship[],
  componentInstances: GraphRelationship[],
  methodsByClassId: Map<string, GraphNode[]>,
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  let count = 0;
  const pattern = binding.ref_field_pattern ? new RegExp(binding.ref_field_pattern) : null;
  const entryPoints = binding.target_entry_points ?? [];
  if (!pattern || entryPoints.length === 0) return 0;

  const runtimeRootId = generateId('Method', 'unity-runtime-root');

  for (const ref of assetGuidRefs) {
    let fieldName = '';
    try {
      const parsed = JSON.parse(ref.reason);
      fieldName = parsed.fieldName ?? '';
    } catch { continue; }
    if (!pattern.test(fieldName)) continue;

    const targetMethods = findMethodsOnResource(ref.targetId, componentInstances, methodsByClassId, entryPoints);
    for (const method of targetMethods) {
      if (addEdge(runtimeRootId, method.id, `unity-rule-resource-load:${ruleId}`)) count++;
    }
  }
  return count;
}

function processMethodTriggersFieldLoad(
  binding: UnityResourceBinding,
  ruleId: string,
  assetGuidRefs: GraphRelationship[],
  componentInstances: GraphRelationship[],
  methodsByClassId: Map<string, GraphNode[]>,
  containerNodes: GraphNode[],
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  let count = 0;
  const classPattern = binding.host_class_pattern ? new RegExp(binding.host_class_pattern) : null;
  const loaderMethodNames = new Set(binding.loader_methods ?? []);
  const entryPoints = binding.target_entry_points ?? [];
  const defaultEntryPoints = ['OnEnable', 'Awake', 'Start'];
  const resolvedEntryPoints = entryPoints.length > 0 ? entryPoints : defaultEntryPoints;
  if (!classPattern || loaderMethodNames.size === 0) return 0;

  // Build asset ref index by source file
  const refsBySource = new Map<string, GraphRelationship[]>();
  for (const ref of assetGuidRefs) {
    const list = refsBySource.get(ref.sourceId) ?? [];
    list.push(ref);
    refsBySource.set(ref.sourceId, list);
  }

  for (const cls of containerNodes) {
    if (!classPattern.test(cls.properties.name)) continue;
    const methods = methodsByClassId.get(cls.id) ?? [];
    const loaders = methods.filter(m => loaderMethodNames.has(m.properties.name));
    if (loaders.length === 0) continue;

    // Find resource files this class is mounted on
    const resourceFileIds = new Set<string>();
    for (const ci of componentInstances) {
      if (ci.sourceId === cls.id) resourceFileIds.add(ci.targetId);
    }

    // Follow asset refs from those resource files
    for (const resourceFileId of resourceFileIds) {
      for (const ref of refsBySource.get(resourceFileId) ?? []) {
        const targetMethods = findMethodsOnResource(ref.targetId, componentInstances, methodsByClassId, resolvedEntryPoints);
        for (const loader of loaders) {
          for (const target of targetMethods) {
            if (addEdge(loader.id, target.id, `unity-rule-loader-bridge:${ruleId}`)) count++;
          }
        }
      }
    }
  }
  return count;
}

function processMethodTriggersSceneLoad(
  binding: UnityResourceBinding,
  ruleId: string,
  componentInstances: GraphRelationship[],
  methodsByClassId: Map<string, GraphNode[]>,
  containerNodes: GraphNode[],
  sceneFilesByName: Map<string, string[]>,
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  const classPattern = binding.host_class_pattern ? new RegExp(binding.host_class_pattern) : null;
  const loaderMethodNames = new Set(binding.loader_methods ?? []);
  const sceneName = binding.scene_name;
  const defaultEntryPoints = ['OnEnable', 'Awake', 'Start'];
  const entryPoints = (binding.target_entry_points ?? []).length > 0
    ? binding.target_entry_points!
    : defaultEntryPoints;

  if (!classPattern || loaderMethodNames.size === 0 || !sceneName) return 0;

  const sceneFileIds = sceneFilesByName.get(sceneName.toLowerCase()) ?? [];
  if (sceneFileIds.length === 0) return 0;

  let count = 0;
  for (const cls of containerNodes) {
    if (!classPattern.test(cls.properties.name)) continue;
    const methods = methodsByClassId.get(cls.id) ?? [];
    const loaders = methods.filter(m => loaderMethodNames.has(m.properties.name));
    if (loaders.length === 0) continue;

    for (const sceneFileId of sceneFileIds) {
      const targetMethods = findMethodsOnResource(sceneFileId, componentInstances, methodsByClassId, entryPoints);
      for (const loader of loaders) {
        for (const target of targetMethods) {
          if (addEdge(loader.id, target.id, `unity-rule-scene-load:${ruleId}`)) count++;
        }
      }
    }
  }
  return count;
}

function processMethodTriggersMethod(
  binding: UnityResourceBinding,
  ruleId: string,
  methodsByClassId: Map<string, GraphNode[]>,
  containerNodes: GraphNode[],
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  const { source_class_pattern, source_method, target_class_pattern, target_method } = binding;
  if (!source_class_pattern || !source_method || !target_class_pattern || !target_method) return 0;

  const srcPattern = new RegExp(source_class_pattern);
  const tgtPattern = new RegExp(target_class_pattern);

  let sourceMethodId: string | undefined;
  let targetMethodId: string | undefined;

  for (const cls of containerNodes) {
    if (!sourceMethodId && srcPattern.test(cls.properties.name)) {
      const match = (methodsByClassId.get(cls.id) ?? []).find(m => m.properties.name === source_method);
      if (match) sourceMethodId = match.id;
    }
    if (!targetMethodId && tgtPattern.test(cls.properties.name)) {
      const match = (methodsByClassId.get(cls.id) ?? []).find(m => m.properties.name === target_method);
      if (match) targetMethodId = match.id;
    }
    if (sourceMethodId && targetMethodId) break;
  }

  if (!sourceMethodId || !targetMethodId) return 0;
  return addEdge(sourceMethodId, targetMethodId, `unity-rule-method-bridge:${ruleId}`) ? 1 : 0;
}

function processLifecycleOverrides(
  rule: RuntimeClaimRule,
  methodsByClassId: Map<string, GraphNode[]>,
  containerNodes: GraphNode[],
  addEdge: (s: string, t: string, reason: string) => boolean,
): number {
  const overrides = rule.lifecycle_overrides;
  if (!overrides?.additional_entry_points?.length) return 0;
  const entrySet = new Set(overrides.additional_entry_points);
  const scopePattern = overrides.scope ? new RegExp(overrides.scope) : null;
  let count = 0;

  const runtimeRootId = generateId('Method', 'unity-runtime-root');

  for (const cls of containerNodes) {
    if (scopePattern && !scopePattern.test(cls.properties.filePath ?? cls.properties.name)) continue;
    for (const method of methodsByClassId.get(cls.id) ?? []) {
      if (!entrySet.has(method.properties.name)) continue;
      if (addEdge(runtimeRootId, method.id, `unity-rule-lifecycle-override:${rule.id}`)) count++;
    }
  }
  return count;
}
