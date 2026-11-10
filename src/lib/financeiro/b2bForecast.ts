export interface B2BForecast {
  order_id: string;
  total_amount: number;
  residual_amount: number;
  state: string;
  due_dates_estimated: true;
  schedule: Array<{ amount: number; due_date: string | null }>;
}

const states = new Set(['aguardando_fiscal', 'emissao_em_andamento', 'consulta_fiscal_obrigatoria', 'faturado_parcial', 'faturado_total', 'cancelado_antes_nf', 'cancelado_residual']);

export function parseB2BForecast(value: unknown, orderId: string): B2BForecast | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('forecast_invalid');
  const f = value as Record<string, unknown>;
  const total = Number(f.total_amount), residual = Number(f.residual_amount);
  if (f.order_id !== orderId || f.due_dates_estimated !== true || typeof f.state !== 'string' || !states.has(f.state)
    || f.total_amount == null || f.residual_amount == null || !Number.isFinite(total) || !Number.isFinite(residual)
    || total <= 0 || residual < 0 || residual > total || !Array.isArray(f.schedule)) throw new Error('forecast_invalid');
  if (['faturado_total', 'cancelado_antes_nf', 'cancelado_residual'].includes(f.state) && residual !== 0) throw new Error('forecast_invalid');
  const schedule = f.schedule.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('forecast_invalid');
    const s = entry as Record<string, unknown>;
    const amount = Number(s.amount);
    if (s.amount == null || !Number.isFinite(amount) || amount <= 0 || (s.due_date != null && typeof s.due_date !== 'string')) throw new Error('forecast_invalid');
    return { amount, due_date: typeof s.due_date === 'string' ? s.due_date : null };
  });
  if (!schedule.length || Math.round(schedule.reduce((sum, s) => sum + s.amount, 0) * 100) !== Math.round(total * 100)) throw new Error('forecast_invalid');
  return { order_id: orderId, total_amount: total, residual_amount: residual, state: f.state, due_dates_estimated: true, schedule };
}