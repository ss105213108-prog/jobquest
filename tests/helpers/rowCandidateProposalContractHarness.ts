import type { RowCandidateProposal } from '../../src/parsers/pdfRowEvidenceGraphBuilder'
import type { RunId } from '../../src/parsers/pdfRowEvidenceGraph'

export const proposalMembership = (proposals: readonly RowCandidateProposal[]): readonly (readonly RunId[])[] => (
  proposals.map((proposal) => [...proposal.runIds])
)
