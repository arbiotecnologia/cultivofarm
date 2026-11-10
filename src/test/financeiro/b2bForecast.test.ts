import { describe, expect, it } from 'vitest';
import { parseB2BForecast } from '@/lib/financeiro/b2bForecast';

const base = { order_id: 'order', total_amount: 18, residual_amount: 18, state: 'aguardando_fiscal', due_dates_estimated: true, schedule: [{ amount: 18, due_date: '2027-03-03' }] };
describe('previsão separada e escopada', () => {
  it('mantém 18 não exigíveis antes da NF', () => expect(parseB2BForecast(base, 'order')?.residual_amount).toBe(18));
  it('mantém residual 9 após NF parcial 9', () => expect(parseB2BForecast({ ...base, state: 'faturado_parcial', residual_amount: 9 }, 'order')?.residual_amount).toBe(9));
  it('exige residual zero na confirmação final', () => expect(() => parseB2BForecast({ ...base, state: 'faturado_total', residual_amount: 9 }, 'order')).toThrow());
  it('não aceita outro pedido', () => expect(() => parseB2BForecast(base, 'foreign')).toThrow());
  it('não transforma vencimento estimado em definitivo', () => expect(() => parseB2BForecast({ ...base, due_dates_estimated: false }, 'order')).toThrow());
  it('não aceita residual superior ao total econômico', () => expect(() => parseB2BForecast({ ...base, residual_amount: 19 }, 'order')).toThrow());
  it('não inventa previsão para ausência confirmada', () => expect(parseB2BForecast(null, 'order')).toBeNull());
});