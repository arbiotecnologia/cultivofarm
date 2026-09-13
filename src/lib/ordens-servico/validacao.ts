import { z } from 'zod';

export const diaSP = (value: string | Date): string => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : '';
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(date) : '';
};
export function correspondePeriodo(value: string, periodo: string, now = new Date()) {
  if (periodo === 'all') return true;
  const dia = diaSP(value), hoje = diaSP(now);
  if (!dia) return false;
  if (periodo === 'today') return dia === hoje;
  if (periodo === 'month') return dia.slice(0, 7) === hoje.slice(0, 7);
  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 6);
  return dia >= inicio.toISOString().slice(0, 10) && dia <= hoje;
}
export const normalizar = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const buscaOS = (termo: string, campos: unknown[]) => !normalizar(termo) || campos.some(v => normalizar(v).includes(normalizar(termo)));
export const volumeOS = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0
  ? `${(v / 1000).toLocaleString('pt-BR', { maximumSignificantDigits: 6 })} L` : '—';
export function unificarOS<T extends { id: string; origem: string }>(rows: T[]): T[] {
  return Array.from(new Map(rows.map(row => [`${row.origem}:${row.id}`, row])).values());
}
export const schemaOS = z.object({
  cliente_id: z.string().uuid(), fazenda_id: z.string().uuid(), talhao_id: z.string().uuid(),
  tipo_item: z.enum(['produto', 'microrganismo']), produto_id: z.string(), microrganismo_id: z.string(),
  modo_aplicacao: z.enum(['foliar', 'solo', 'fertirrigacao', 'tratamento_semente']),
  area_hectares: z.coerce.number().finite().positive(),
  data_programada: z.string().refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v) && diaSP(v) === v),
  prioridade: z.enum(['baixa', 'media', 'alta']),
});
export function validarOS(form: unknown, refs: {
  clientes: {id: string}[]; fazendas: {id: string; cliente_id: string}[];
  talhoes: {id: string; fazenda_id: string}[];
  produtos: {id: string; dose_ml_ha: number | null}[]; microrganismos: {id: string; dose_ml_ha: number | null}[];
}) {
  const parsed = schemaOS.safeParse(form);
  if (!parsed.success) return 'Revise os campos obrigatórios, área positiva, prioridade e data válida.';
  const f = parsed.data;
  if (!refs.clientes.some(c => c.id === f.cliente_id) || !refs.fazendas.some(v => v.id === f.fazenda_id && v.cliente_id === f.cliente_id) || !refs.talhoes.some(t => t.id === f.talhao_id && t.fazenda_id === f.fazenda_id)) return 'Cliente, fazenda e talhão devem estar vinculados.';
  const item = f.tipo_item === 'produto' ? refs.produtos.find(p => p.id === f.produto_id) : refs.microrganismos.find(p => p.id === f.microrganismo_id);
  const dose = item?.dose_ml_ha;
  if (!item || typeof dose !== 'number' || !Number.isFinite(dose) || dose <= 0 || !Number.isFinite(dose * f.area_hectares)) return 'Selecione um item com dose válida e volume positivo.';
  return null;
}
export function erroOS(error: unknown) {
  const code = (error as {code?: string})?.code;
  if (code === '42501') return 'Sem permissão para esta operação.';
  if (code === '23505') return 'Conflito: esta ordem já pode ter sido registrada. Sincronize antes de continuar.';
  return 'Não foi possível confirmar a operação. Sincronize e confira o histórico antes de tentar novamente.';
}
