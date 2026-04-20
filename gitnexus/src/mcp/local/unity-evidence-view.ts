import type { UnityEvidenceMode } from '../../core/unity/options.js';
import type { ResolvedUnityBinding, UnitySerializedFields } from '../../core/unity/resolver.js';

export interface UnityEvidenceMeta {
  truncated: boolean;
  omitted_count: number;
  next_fetch_hint?: string;
  filter_exhausted?: boolean;
  minimum_evidence_satisfied: boolean;
  verifier_minimum_evidence_satisfied?: boolean;
}

export interface UnityEvidenceViewResult {
  resourceBindings: ResolvedUnityBinding[];
  serializedFields?: UnitySerializedFields;
  evidence_meta: UnityEvidenceMeta;
  filter_diagnostics: string[];
}

export interface UnityEvidenceViewInput {
  resourceBindings: ResolvedUnityBinding[];
  mode?: UnityEvidenceMode;
  scopePreset?: string;
  resourcePathPrefix?: string;
  bindingKind?: string;
  maxBindings?: number;
  maxReferenceFields?: number;
}

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').toLowerCase();
}

function parsePositiveInt(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function resolveModeDefaults(mode?: UnityEvidenceMode): { maxBindings?: number; maxReferenceFields?: number } {
  if (mode === 'summary') {
    return { maxBindings: 1, maxReferenceFields: 1 };
  }
  if (mode === 'focused') {
    return { maxBindings: 5, maxReferenceFields: 5 };
  }
  return {};
}

function aggregateSerializedFields(resourceBindings: ResolvedUnityBinding[]): UnitySerializedFields {
  return {
    scalarFields: resourceBindings.flatMap((binding) => binding.serializedFields.scalarFields),
    referenceFields: resourceBindings.flatMap((binding) => binding.serializedFields.referenceFields),
  };
}

export function buildUnityEvidenceView(input: UnityEvidenceViewInput): UnityEvidenceViewResult {
  const diagnostics: string[] = [];
  const originalCount = input.resourceBindings.length;

  let filtered = [...input.resourceBindings];

  if (input.scopePreset === 'unity-gameplay') {
    filtered = filtered.filter((binding) => {
      const p = normalizePath(binding.resourcePath);
      return p.startsWith('assets/')
        && !p.startsWith('assets/plugins/')
        && !p.startsWith('packages/')
        && !p.startsWith('library/');
    });
  }

  const prefix = normalizePath(String(input.resourcePathPrefix || ''));
  if (prefix) {
    filtered = filtered.filter((binding) => normalizePath(binding.resourcePath).startsWith(prefix));
  }

  const bindingKind = String(input.bindingKind || '').trim();
  if (bindingKind) {
    filtered = filtered.filter((binding) => String(binding.bindingKind) === bindingKind);
  }

  const filterExhausted = filtered.length === 0 && originalCount > 0;
  if (filterExhausted) {
    diagnostics.push('filter_exhausted');
  }

  const modeDefaults = resolveModeDefaults(input.mode);
  const maxBindings = parsePositiveInt(input.maxBindings) ?? modeDefaults.maxBindings;
  const maxReferenceFields = parsePositiveInt(input.maxReferenceFields) ?? modeDefaults.maxReferenceFields;

  const beforeBindingTrim = filtered.length;
  if (maxBindings !== undefined) {
    filtered = filtered.slice(0, maxBindings);
  }
  let omittedCount = Math.max(0, beforeBindingTrim - filtered.length);

  if (maxReferenceFields !== undefined) {
    filtered = filtered.map((binding) => {
      const referenceFields = binding.serializedFields.referenceFields;
      const referenceTrimmed = referenceFields.length > maxReferenceFields;
      if (referenceTrimmed) {
        omittedCount += referenceFields.length - maxReferenceFields;
      }
      return {
        ...binding,
        serializedFields: {
          ...binding.serializedFields,
          referenceFields: referenceTrimmed
            ? referenceFields.slice(0, maxReferenceFields)
            : referenceFields,
        },
        resolvedReferences: binding.resolvedReferences.length > (maxReferenceFields || 0)
          ? binding.resolvedReferences.slice(0, maxReferenceFields)
          : binding.resolvedReferences,
      };
    });
  }

  const truncated = omittedCount > 0;
  const evidence_meta: UnityEvidenceMeta = {
    truncated,
    omitted_count: omittedCount,
    ...(truncated ? { next_fetch_hint: 'Rerun with unity_evidence_mode=full to fetch complete evidence.' } : {}),
    ...(filterExhausted ? { filter_exhausted: true } : {}),
    minimum_evidence_satisfied: !truncated && filtered.length > 0,
    verifier_minimum_evidence_satisfied: filtered.length > 0,
  };

  return {
    resourceBindings: filtered,
    serializedFields: input.mode === 'full' ? aggregateSerializedFields(filtered) : undefined,
    evidence_meta,
    filter_diagnostics: diagnostics,
  };
}
