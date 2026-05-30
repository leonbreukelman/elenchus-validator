import { actionTerms } from "../../evaluation/actions.js";
import { DETERMINISTIC_PROVIDER_METADATA } from "../../evaluation/report.js";
import type { AlternativeAction, EvaluationRequestV2, ProviderMetadata, SupportAssessment } from "../../evaluation/types.js";
import type { EvaluationProvider } from "./types.js";

export class DeterministicEvaluationProvider implements EvaluationProvider {
  metadata: ProviderMetadata = DETERMINISTIC_PROVIDER_METADATA;

  async assessSupport(request: EvaluationRequestV2, alternatives: AlternativeAction[]): Promise<SupportAssessment> {
    const rationale = request.rationale.toLowerCase();
    const originalActionTerms = actionTerms(request.proposedAction.type);
    const originalSupport = Math.min(1, 0.35 + originalActionTerms.filter((term) => rationale.includes(term)).length * 0.16);
    const alternativeScores = alternatives.map((alternative) => {
      const terms = actionTerms(alternative.action.type);
      return Math.min(0.82, 0.18 + terms.filter((term) => rationale.includes(term)).length * 0.16);
    });
    const strongestAlternativeSupport = alternativeScores.length > 0 ? Math.max(...alternativeScores) : 0;
    const strongestIndex = alternativeScores.indexOf(strongestAlternativeSupport);

    return {
      originalSupport,
      strongestAlternativeSupport,
      specificityMargin: Number((originalSupport - strongestAlternativeSupport).toFixed(4)),
      strongestAlternativeId: strongestIndex >= 0 ? alternatives[strongestIndex].id : null,
      notes: ["Deterministic local support score; no provider calibration claim."],
    };
  }
}
