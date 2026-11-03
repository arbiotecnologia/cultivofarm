/** Price over outstanding principal, fixed monthly rate. All cash rows in cents;
 * last installment absorbs cent rounding; no extra interest for calendar shifts. */
export function priceSchedule(principal: number, monthlyPercent: number, count: number) {
  if (!Number.isFinite(principal) || principal < 0 || !Number.isFinite(monthlyPercent) || monthlyPercent < 0 || !Number.isInteger(count) || count < 1 || count > 60) throw new Error('PRICE_INVALID');
  if (principal > 999999999999.99 || monthlyPercent > 100 || Math.abs(principal * 100 - Math.round(principal * 100)) > 1e-4) throw new Error('PRICE_NOT_REPRESENTABLE');
  const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
  const rate = monthlyPercent / 100;
  let balance = cents(principal);
  const payment = rate === 0 ? balance / count : balance * rate / (1 - (1 + rate) ** -count);
  return Array.from({ length: count }, (_, i) => {
    const interest = Math.round(balance * rate + 1e-8);
    const amount = i === count - 1 ? balance + interest : Math.round(payment);
    const amortization = amount - interest;
    if (principal > 0 && (amortization <= 0 || amount <= 0)) throw new Error('PRICE_NOT_REPRESENTABLE');
    balance -= amortization;
    return { original_amount: amount / 100, principal_amount: amortization / 100,
      financed_interest_amount: interest / 100, interest_amount: interest / 100,
      monetary_semantics: 'financed_total_v1' as const, balance: balance / 100 };
  });
}