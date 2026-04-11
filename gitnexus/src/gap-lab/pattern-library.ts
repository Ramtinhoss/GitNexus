export type ExhaustiveGapSubtype =
  | 'mirror_synclist_callback'
  | 'mirror_syncdictionary_callback'
  | 'mirror_syncvar_hook';

export interface ExhaustivePattern {
  gapSubtype: ExhaustiveGapSubtype;
  patternId: string;
  rgPattern: string;
  jsPattern: RegExp;
}

const PATTERNS: Record<ExhaustiveGapSubtype, ExhaustivePattern> = {
  mirror_synclist_callback: {
    gapSubtype: 'mirror_synclist_callback',
    patternId: 'event_delegate.mirror_synclist_callback.v1',
    rgPattern: String.raw`\bCallback\s*\+=\s*[A-Za-z_][A-Za-z0-9_]*`,
    jsPattern: /\bCallback\s*\+=\s*[A-Za-z_][A-Za-z0-9_]*/,
  },
  mirror_syncdictionary_callback: {
    gapSubtype: 'mirror_syncdictionary_callback',
    patternId: 'event_delegate.mirror_syncdictionary_callback.v1',
    rgPattern: String.raw`\bCallback\s*\+=\s*[A-Za-z_][A-Za-z0-9_]*`,
    jsPattern: /\bCallback\s*\+=\s*[A-Za-z_][A-Za-z0-9_]*/,
  },
  mirror_syncvar_hook: {
    gapSubtype: 'mirror_syncvar_hook',
    patternId: 'event_delegate.mirror_syncvar_hook.v1',
    rgPattern: String.raw`\[\s*SyncVar\s*\([^)\n]*hook\s*=\s*nameof\([^)\n]*\)`,
    jsPattern: /\[\s*SyncVar\s*\([^)\n]*hook\s*=\s*nameof\([^)\n]*\)/,
  },
};

export function getExhaustivePattern(gapSubtype: ExhaustiveGapSubtype): ExhaustivePattern {
  return PATTERNS[gapSubtype];
}

export function listExhaustivePatterns(): ExhaustivePattern[] {
  return Object.values(PATTERNS);
}

