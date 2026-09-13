export const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function diaSP(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function dataLote(value: string | null | undefined) {
  const day = diaSP(value);
  return day ? day.split('-').reverse().join('/') : '—';
}
export function numeroValido(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function volumeL(value: unknown) {
  const n = numeroValido(value);
  return n === null ? '—' : `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 6 })} L`;
}
export function resumoVolumes(produzido: unknown, envases: { quantidade: number | null; volume_por_unidade: number | null }[]) {
  const volume = numeroValido(produzido);
  let envasado: number | null = 0;
  for (const e of envases) {
    const q = numeroValido(e.quantidade), v = numeroValido(e.volume_por_unidade);
    if (q === null || v === null || !Number.isInteger(q) || q === 0 || v === 0) { envasado = null; break; }
    envasado += q * v;
    if (!Number.isFinite(envasado)) { envasado = null; break; }
  }
  const excedido = volume !== null && envasado !== null && envasado > volume;
  return { produzido: volume, envasado, saldo: volume === null || envasado === null || excedido ? null : volume - envasado, inconsistente: excedido || envasado === null || volume === null };
}
export function noPeriodo(value: string, inicio: string, fim: string) {
  if (!inicio && !fim) return true;
  const day = diaSP(value);
  return !!day && (!inicio || day >= inicio) && (!fim || day <= fim);
}
export function cockpitLote(osId?: string | null) {
  return osId ? `/cockpit-laboratorio?os=${encodeURIComponent(osId)}` : '/cockpit-laboratorio';
}
