import type { ResolvedCandidate } from './candidate-resolver.js';

export interface MissingEdgeLookupInput {
  handlerSymbol: string;
  candidate: ResolvedCandidate;
}

export interface VerifyMissingEdgesInput {
  candidates: ResolvedCandidate[];
  edgeLookup?: (input: MissingEdgeLookupInput) => Promise<boolean>;
}

export type VerifyStatus = 'verified_missing' | 'rejected';

export interface VerifiedCandidate extends Omit<ResolvedCandidate, 'status' | 'reasonCode'> {
  status: VerifyStatus;
  reasonCode?: ResolvedCandidate['reasonCode'] | 'edge_already_present';
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

    out.push({
      ...candidate,
      status: 'verified_missing',
      missingEdge: true,
    });
  }
  return out;
}

