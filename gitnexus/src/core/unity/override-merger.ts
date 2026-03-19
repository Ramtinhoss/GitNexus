export interface UnityScalarFieldInput {
  value: string;
  valueType?: string;
}

export interface UnityReferenceFieldInput {
  fileId?: string;
  guid?: string;
  resolvedAssetPath?: string;
}

export interface UnityObjectLayer {
  sourceLayer: string;
  scalarFields?: Record<string, UnityScalarFieldInput>;
  referenceFields?: Record<string, UnityReferenceFieldInput>;
}

export interface MergedUnityScalarField extends UnityScalarFieldInput {
  name: string;
  sourceLayer: string;
}

export interface MergedUnityReferenceField extends UnityReferenceFieldInput {
  name: string;
  sourceLayer: string;
}

export interface MergedUnityComponent {
  scalarFields: Record<string, MergedUnityScalarField>;
  referenceFields: Record<string, MergedUnityReferenceField>;
}

export function mergeOverrideChain(
  ...layersOrArray: Array<UnityObjectLayer | UnityObjectLayer[]>
): MergedUnityComponent {
  const layers = normalizeLayers(layersOrArray);
  const merged: MergedUnityComponent = {
    scalarFields: {},
    referenceFields: {},
  };

  for (const layer of layers) {
    if (!layer) continue;

    for (const [name, field] of Object.entries(layer.scalarFields || {})) {
      merged.scalarFields[name] = {
        name,
        sourceLayer: layer.sourceLayer,
        value: field.value,
        valueType: field.valueType,
      };
    }

    for (const [name, field] of Object.entries(layer.referenceFields || {})) {
      merged.referenceFields[name] = {
        name,
        sourceLayer: layer.sourceLayer,
        fileId: field.fileId,
        guid: field.guid,
        resolvedAssetPath: field.resolvedAssetPath,
      };
    }
  }

  return merged;
}

function normalizeLayers(layersOrArray: Array<UnityObjectLayer | UnityObjectLayer[]>): UnityObjectLayer[] {
  if (layersOrArray.length === 1 && Array.isArray(layersOrArray[0])) {
    return layersOrArray[0] as UnityObjectLayer[];
  }

  return layersOrArray as UnityObjectLayer[];
}
