/** Canonical money discriminator; absence means legacy principal + accrued interest.
 * New generators must separate financing already included from late interest.
 * Never infer semantics from the magnitude of an amount or rewrite old rows. */
export interface ReceivableMoney {
  original_amount?: unknown;
  interest_amount?: unknown;
  monetary_semantics?: 'legacy_principal_plus_interest' | 'financed_total_v1';
  financed_interest_amount?: unknown;
}

export function additionalInterest(p: ReceivableMoney): number {
  const interest = Number(p.interest_amount ?? 0);
  if (p.monetary_semantics != null && !['financed_total_v1','legacy_principal_plus_interest'].includes(p.monetary_semantics)) throw new Error('FIN_MONETARY_SEMANTICS_INVALID');
  if (p.monetary_semantics !== 'financed_total_v1') return Number.isFinite(interest) ? interest : 0;
  const financed = Number(p.financed_interest_amount);
  if (p.financed_interest_amount == null || !Number.isFinite(financed) || financed < 0 || !Number.isFinite(interest) || financed > interest) {
    throw new Error('FIN_MONETARY_SEMANTICS_INVALID');
  }
  return Math.round((interest - financed) * 100) / 100;
}