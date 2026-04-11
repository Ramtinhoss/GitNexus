import { createHash } from 'node:crypto';
import type { LexicalMatch } from './exhaustive-scanner.js';
import { classifyScopePath } from './scope-classifier.js';

export type CandidateResolveStatus = 'resolved' | 'rejected';

export interface ResolvedCandidate {
  candidateId: string;
  gapSubtype: LexicalMatch['gapSubtype'];
  patternId: string;
  file: string;
  line: number;
  sourceText: string;
  scopeClass: 'user_code' | 'third_party' | 'unknown';
  scopeReasonCode: string;
  status: CandidateResolveStatus;
  handlerSymbol?: string;
  reasonCode?: 'handler_symbol_unresolved';
}

export interface ResolveCandidatesInput {
  matches: LexicalMatch[];
}

function candidateId(match: LexicalMatch): string {
  return createHash('sha1')
    .update(`${match.gapSubtype}:${match.file}:${match.line}:${match.text}`)
    .digest('hex')
    .slice(0, 12);
}

function resolveHandlerSymbol(match: LexicalMatch): string | null {
  if (match.gapSubtype === 'mirror_syncvar_hook') {
    const syncvar = match.text.match(/hook\s*=\s*nameof\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/);
    return syncvar?.[1] || null;
  }
  const callback = match.text.match(/\bCallback\s*\+=\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:;|$)/);
  return callback?.[1] || null;
}

export async function resolveLexicalCandidates(input: ResolveCandidatesInput): Promise<ResolvedCandidate[]> {
  return input.matches.map((match) => {
    const scope = classifyScopePath(match.file);
    const handlerSymbol = resolveHandlerSymbol(match);
    if (!handlerSymbol) {
      return {
        candidateId: candidateId(match),
        gapSubtype: match.gapSubtype,
        patternId: match.patternId,
        file: match.file,
        line: match.line,
        sourceText: match.text,
        scopeClass: scope.scopeClass,
        scopeReasonCode: scope.reasonCode,
        status: 'rejected',
        reasonCode: 'handler_symbol_unresolved',
      };
    }
    return {
      candidateId: candidateId(match),
      gapSubtype: match.gapSubtype,
      patternId: match.patternId,
      file: match.file,
      line: match.line,
      sourceText: match.text,
      scopeClass: scope.scopeClass,
      scopeReasonCode: scope.reasonCode,
      status: 'resolved',
      handlerSymbol,
    };
  });
}
