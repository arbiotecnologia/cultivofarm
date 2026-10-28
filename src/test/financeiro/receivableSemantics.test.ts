import { describe, expect, it } from 'vitest';
import { calcularSaldoRecebivel } from '@/lib/financeiro/baixaRecebimento';
import { saldoParcela } from '@/lib/financeiro/contasReceber';

// Caracterização da cadeia capturada; não autoriza mudar a semântica histórica.
describe('Saldo financeiro — geração versus ajustes dos pagamentos', () => {
  it('reproduz duplicação inicial nos dois consumidores, sem mascarar o P0', () => {
    const captured = { original_amount: 10300, interest_amount: 300 };
    expect(calcularSaldoRecebivel(captured)).toBe(10600);
    expect(saldoParcela(captured)).toBe(10600);
  });
  it('total contratado inclui financiamento; ajustes zero não o cobram novamente', () => {
    const experimental = { original_amount: 10300, interest_amount: 0 };
    expect(calcularSaldoRecebivel(experimental)).toBe(10300);
    expect(saldoParcela(experimental)).toBe(10300);
  });
  it('preserva juros monetários da baixa, multa e desconto no saldo pós-pagamento', () => {
    const afterPayment = { original_amount: 10300, received_amount: 3000,
      interest_amount: 100, penalty_amount: 200, discount_amount: 50 };
    expect(calcularSaldoRecebivel(afterPayment)).toBe(7550);
    expect(saldoParcela(afterPayment)).toBe(7550);
  });
  it('não converte original para principal: perderia financiamento após o recálculo real', () => {
    const principalOnly = { original_amount: 10000, received_amount: 3000,
      interest_amount: 100, penalty_amount: 200, discount_amount: 50 };
    expect(calcularSaldoRecebivel(principalOnly)).toBe(7250);
    expect(saldoParcela(principalOnly)).toBe(7250);
  });
  it('quitação e estorno mantêm o total original sem consultar taxas atuais', () => {
    expect(saldoParcela({ original_amount: 10300, received_amount: 10300 })).toBe(0);
    expect(saldoParcela({ original_amount: 10300, received_amount: 0 })).toBe(10300);
  });
  it('segunda baixa e estorno parcial preservam apenas o encargo não estornado', () => {
    expect(saldoParcela({ original_amount: 10300, received_amount: 4000,
      interest_amount: 100, penalty_amount: 200, discount_amount: 50 })).toBe(6550);
    expect(calcularSaldoRecebivel({ original_amount: 10300, received_amount: 1000,
      interest_amount: 0, penalty_amount: 0, discount_amount: 0 })).toBe(9300);
  });
  it('snapshot contratado conserva centavos sem recalcular taxa no leitor', () => {
    const installments = [2225.96, 2225.96, 2225.95];
    expect(installments.reduce((cents, amount) => cents + Math.round(amount * 100), 0)).toBe(667787);
    expect(saldoParcela({ original_amount: 2225.95, received_amount: 2225.95 })).toBe(0);
  });
});