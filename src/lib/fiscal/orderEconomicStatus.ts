import type { OverloadSummary } from "./eligibilityDiagnostic";

/** Diagnosis is display-only: never substitutes eligible/reasons or writer authority. */
export function economicApprovalsComplete(d: OverloadSummary | null | undefined): boolean {
  return d?.ok === true && d.orderMatchesInput === true && d.economicDiagnosis?.available === true &&
    d.economicDiagnosis.commercialExplicit === true && d.economicDiagnosis.creditExplicit === true;
}

export function economicOperationalPending(d: OverloadSummary | null | undefined): boolean {
  return economicApprovalsComplete(d) && d?.eligible === false &&
    d.economicDiagnosis?.operationalBlocked === true;
}

export const ECONOMIC_OPERATIONAL_PENDING = "Aprovações comercial e de crédito concluídas. Liberação operacional para faturamento pendente.";