import { createHash } from 'node:crypto';
import type { LexicalMatch } from './exhaustive-scanner.js';
import { classifyScopePath } from './scope-classifier.js';
import type { CandidateAnchor, SyncVarRecoveryReason } from './syncvar-source-anchor-recovery.js';
import { recoverSyncVarAnchors } from './syncvar-source-anchor-recovery.js';

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
  hostClassName?: string;
  fieldName?: string;
  declarationAnchor?: CandidateAnchor;
  sourceAnchor?: CandidateAnchor;
  targetAnchor?: CandidateAnchor;
  sourceAnchorCandidates?: CandidateAnchor[];
  reasonCode?: 'handler_symbol_unresolved' | SyncVarRecoveryReason;
}

export interface ResolveCandidatesInput {
  matches: LexicalMatch[];
  repoPath?: string;
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
  return Promise.all(input.matches.map(async (match) => {
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
    if (match.gapSubtype === 'mirror_syncvar_hook' && input.repoPath) {
      const recovery = await recoverSyncVarAnchors({
        repoPath: input.repoPath,
        file: match.file,
        line: match.line,
        handlerSymbol,
      });
      if (recovery.reasonCode === 'handler_symbol_unresolved') {
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
          hostClassName: recovery.hostClassName,
          fieldName: recovery.fieldName,
          declarationAnchor: recovery.declarationAnchor,
          reasonCode: recovery.reasonCode,
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
        hostClassName: recovery.hostClassName,
        fieldName: recovery.fieldName,
        declarationAnchor: recovery.declarationAnchor,
        sourceAnchor: recovery.sourceAnchor,
        targetAnchor: recovery.targetAnchor,
        sourceAnchorCandidates: recovery.sourceAnchorCandidates,
        reasonCode: recovery.reasonCode,
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
  }));
}
