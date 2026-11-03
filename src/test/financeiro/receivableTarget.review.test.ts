import { describe, expect, it, vi } from 'vitest';
import projection from './fixtures/money-origin-projection.json';
import { MONEY_ORIGIN_MESSAGE, readProvenReceivables } from '@/lib/financeiro/receivableOrigin';
import { saldoParcela } from '@/lib/financeiro/contasReceber';

const row = projection.audit_fixture_projection[0];
function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) };
}
describe('vinculação de alvo da projeção — transporte simulado, não prova RLS', () => {
  it('preserva projeção PG positiva e saldo10300 para título solicitado igual', async () => {
    const rows = await readProvenReceivables(client([row]), row.receivable_id);
    expect(rows).toEqual([row]);
    expect(saldoParcela(rows[0])).toBe(10300);
  });
  it('nega envelope internamente válido de outro título solicitado', async () => {
    await expect(readProvenReceivables(client([row]), 'another-requested-title')).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
  });
  it('nega resposta mista sem adotar parcialmente linhas válidas', async () => {
    await expect(readProvenReceivables(client([row, ...projection.generator_projection]), row.receivable_id)).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
  });
  it.each([row.receivable_id, null])('nega IDs de parcelas duplicados no modo %s', async title => {
    await expect(readProvenReceivables(client([row, row]), title)).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
  });
  it('KPI null aceita títulos distintos com IDs únicos e escopo delegado ao servidor', async () => {
    const c = client([row, ...projection.generator_projection]);
    const rows = await readProvenReceivables(c, null);
    expect(rows).toHaveLength(4);
    expect(c.rpc).toHaveBeenCalledWith('rpc_receivable_money_projection_v1', { p_receivable_id: null, p_offset: 0, p_limit: 1000 });
  });
  it('mesmo título pode ter parcelas distintas', async () => {
    expect(await readProvenReceivables(client(projection.generator_projection), projection.generator_projection[0].receivable_id)).toHaveLength(3);
  });
  it.each([null, {}, 'invalid', [null], [{ ...row, id: 7, monetary_origin: { ...row.monetary_origin, installment_id: 7 } }]])('retorno inválido falha, nunca saldo zero: %j', async data => {
    await expect(readProvenReceivables(client(data), row.receivable_id)).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
  });
  it('erro com linhas aparentemente válidas não retorna dados', async () => {
    await expect(readProvenReceivables(client([row], { code: 'PT403' }), row.receivable_id)).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
  });
});