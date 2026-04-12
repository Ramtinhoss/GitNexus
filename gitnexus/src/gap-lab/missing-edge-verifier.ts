import type { ResolvedCandidate } from './candidate-resolver.js';

export interface MissingEdgeLookupInput {
  handlerSymbol: string;
  candidate: ResolvedCandidate;
}

export interface VerifyMissingEdgesInput {
  candidates: ResolvedCandidate[];
  edgeLookup?: (input: MissingEdgeLookupInput) => Promise<boolean>;
}

export type VerifyStatus = 'verified_missing' | 'accepted' | 'promotion_backlog' | 'rejected';

export interface VerifiedCandidate extends Omit<ResolvedCandidate, 'status' | 'reasonCode'> {
  status: VerifyStatus;
  reasonCode?: ResolvedCandidate['reasonCode'] | 'edge_already_present' | 'third_party_scope_excluded';
  missingEdge?: boolean;
}

export async function verifyMissingEdges(input: VerifyMissingEdgesInput): Promise<VerifiedCandidate[]> {
  const edgeLookup = input.edgeLookup ?? (async () => false);

  const out: VerifiedCandidate[] = [];
  for (const candidate of input.candidates) {
    if (candidate.status !== 'resolved' || !candidate.handlerSymbol) {
      out.push({
        ...candidate,
        status: 'rejected',
        reasonCode: candidate.reasonCode ?? 'handler_symbol_unresolved',
      });
      continue;
    }

    if (candidate.scopeClass === 'third_party') {
      out.push({
        ...candidate,
        status: 'rejected',
        reasonCode: 'third_party_scope_excluded',
        missingEdge: false,
      });
      continue;
    }

    const edgeExists = await edgeLookup({
      handlerSymbol: candidate.handlerSymbol,
      candidate,
    });

    if (edgeExists) {
      out.push({
        ...candidate,
        status: 'rejected',
        reasonCode: 'edge_already_present',
        missingEdge: false,
      });
      continue;
    }

    if (candidate.gapSubtype === 'mirror_syncvar_hook') {
      if (candidate.sourceAnchor && candidate.targetAnchor) {
        out.push({
          ...candidate,
          status: 'accepted',
          missingEdge: true,
        });
        continue;
      }

      out.push({
        ...candidate,
        status: 'promotion_backlog',
        reasonCode: candidate.reasonCode ?? (
          Array.isArray(candidate.sourceAnchorCandidates) && candidate.sourceAnchorCandidates.length > 1
            ? 'ambiguous_source_anchor'
            : 'missing_runtime_source_anchor'
        ),
        missingEdge: true,
      });
      continue;
    }

    out.push({
      ...candidate,
      status: 'verified_missing',
      missingEdge: true,
    });
  }
  return out;
}
