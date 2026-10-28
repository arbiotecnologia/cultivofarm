import { describe, it, expect } from 'vitest';
import { calcularSaldoRecebivel, validarBaixaRecebimento } from '@/lib/financeiro/baixaRecebimento';
import { classificarParcela, saldoParcela } from '@/lib/financeiro/contasReceber';
import { preview } from '@/pages/comercial/CommercialPaymentPlansPage';
import type { PaymentPlanPayload } from '@/hooks/useCommercialPaymentPlansAdmin';

// Fixtures exclusivamente locais. Não validam baixa, autorização ou RPC hosted.
const plano: PaymentPlanPayload = {
  name: 'LOCAL', code: 'LOCAL', plan_type: 'short_term', max_days: 90,
  months_count: 3, installment_count: 3, discount_percent: 0,
  monthly_interest_percent: 1, interest_type: 'simple', pricing_mode: 'discount_from_base',
  requires_credit_approval: false, requires_guarantee: false, requires_financial_approval: false,
};
describe('Bateria R$10.000 — consumidores existentes, sem pagamentos reais', () => {
  it.each([
    ['3x simples 1%', 0, 1, 'simple', 3, 10300],
    ['6x compostos 1,5%', 0, 1.5, 'compound', 6, 10934.43],
    ['12x compostos 2%', 0, 2, 'compound', 12, 12682.42],
    ['5% desconto + 3x', 5, 1, 'simple', 3, 9785],
    ['10% desconto + 6x', 10, 1.5, 'compound', 6, 9840.99],
  ])('%s: total a centavos comparado ao oráculo Decimal', (_, desconto, taxa, metodo, meses, total) => {
    const r = preview({ ...plano, discount_percent: desconto, monthly_interest_percent: taxa,
      interest_type: metodo, months_count: meses, installment_count: meses }, 10000);
    expect(r).not.toBeNull();
    expect(Math.round((r?.final ?? NaN) * 100)).toBe(Math.round(total * 100));
  });
  it('pagamento parcial R$3.000 deixa saldo R$7.000 sem recalcular taxa do plano', () => {
    expect(calcularSaldoRecebivel({ original_amount: 10000, received_amount: 3000 })).toBe(7000);
  });
  it('mora e multa são valores parametrizados, não taxa de financiamento duplicada', () => {
    expect(calcularSaldoRecebivel({ original_amount: 10000, received_amount: 3000,
      interest_amount: 100, penalty_amount: 200, discount_amount: 50 })).toBe(7250);
  });
  it('antecipação usa somente desconto monetário informado, sem fórmula automática inventada', () => {
    expect(calcularSaldoRecebivel({ original_amount: 10000 }, { discount_amount: 500 })).toBe(9500);
  });
  it('inadimplência é data civil e não lança juros ao consultar', () => {
    expect(classificarParcela('2026-10-27', '2026-10-28')).toBe('vencida');
    expect(saldoParcela({ original_amount: 10000, received_amount: 0 })).toBe(10000);
  });
  it.each([0, -1, 10000.01])('baixa %s é recusada sem dispatch', amount => {
    expect(validarBaixaRecebimento({ parcela: { original_amount: 10000 },
      form: { payment_date: '2026-10-28', amount, payment_method_id: 'local',
        interest_amount: 0, penalty_amount: 0, discount_amount: 0 }, metodosAtivos: ['local'],
      settingsCarregadas: true, exigeComprovante: false, temArquivo: false, temSessao: true })).not.toBeNull();
  });
  it.each([-1, 101])('taxa %s bloqueada no preview; não prova limite servidor', monthly_interest_percent => {
    expect(preview({ ...plano, monthly_interest_percent }, 10000)).toBeNull();
  });
  it('saldo atual conta juros do snapshot como ajuste adicional — caracteriza risco instalado', () => {
    expect(calcularSaldoRecebivel({ original_amount: 10300, interest_amount: 300 })).toBe(10600);
  });
});