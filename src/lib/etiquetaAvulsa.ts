import { z } from 'zod';
import type { RecipientLabel, OperationalFormat } from './etiquetasRecipientes';
import { validatedLabelLogo, type PreparedLabelLogo } from './etiquetaLogo';

const field = (max = 120) => z.string().trim().max(max).refine(v => !/[\u0000-\u001f<>]/.test(v), 'Texto contém caracteres não permitidos.');
export function maskLabelDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}
export function validLabelDate(value: string) {
  if (!value) return true;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [day, month, year] = value.split('/').map(Number);
  if (!day || !month || !year || year < 1900 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
const date = field(10).refine(validLabelDate, 'Informe uma data real em DD/MM/AAAA.');
export const looseLabelSchema = z.object({
  origin: z.enum(['manual', 'producao']), productionKey: field().optional(),
  company: field().refine(v => !!v, 'Empresa não confirmada.'), product: field().refine(v => !!v, 'Informe o produto.'),
  composition: field(300), toxicity: field(200).default(''), lot: field(60).refine(v => !!v, 'Informe a referência do lote.'),
  manufactured: date, bottled: date, expiry: date,
  client: field(), farm: field(), order: field(60), conservation: field(200), notes: field(300),
  volume: z.string().regex(/^\d+(?:[,.]\d{1,3})?$/, 'Informe volume numérico, até três casas decimais.').transform(v => Number(v.replace(',', '.'))).refine(v => Number.isFinite(v) && v > 0 && v <= 1000000, 'Volume deve ser positivo.'),
  unit: z.enum(['L', 'mL', 'kg', 'g']), quantity: z.coerce.number().int().min(1).max(500),
  first: z.coerce.number().int().min(1).max(500), total: z.coerce.number().int().min(1).max(500),
  format: z.enum(['100x150', '100x100', '80x50']), approved: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.first + v.quantity - 1 > v.total) ctx.addIssue({ code: 'custom', path: ['total'], message: 'A sequência final não pode exceder o total de recipientes.' });
  if (v.origin === 'producao' && !v.productionKey) ctx.addIssue({ code: 'custom', path: ['productionKey'], message: 'Selecione uma produção autorizada.' });
  if ((v.composition || v.toxicity || v.conservation || v.notes) && !v.approved) ctx.addIssue({ code: 'custom', path: ['approved'], message: 'Confirme que os textos técnicos foram aprovados.' });
  const iso = (d: string) => d.split('/').reverse().join('-');
  if (v.manufactured && v.bottled && iso(v.bottled) < iso(v.manufactured)) ctx.addIssue({ code: 'custom', path: ['bottled'], message: 'Envase não pode anteceder fabricação.' });
  if (v.expiry && [v.manufactured, v.bottled].some(d => d && iso(v.expiry) < iso(d))) ctx.addIssue({ code: 'custom', path: ['expiry'], message: 'Validade não pode anteceder fabricação ou envase.' });
});
export type LooseLabelDraft = z.input<typeof looseLabelSchema>;
export const EMPTY_LOOSE_LABEL: LooseLabelDraft = { origin: 'manual', company: '', product: '', composition: '', toxicity: '', lot: '', manufactured: '', bottled: '', expiry: '', client: '', farm: '', order: '', conservation: '', notes: '', volume: '', unit: 'L', quantity: 1, first: 1, total: 1, format: '100x150', approved: false };
export function createLooseLabels(draft: LooseLabelDraft, logo?: PreparedLabelLogo, scope?: string): RecipientLabel[] {
  const v = looseLabelSchema.parse(draft);
  validatedLabelLogo(logo, scope);
  return Array.from({ length: v.quantity }, (_, index) => ({
    id: '', trace_token: '', codigo_etiqueta: 'AVULSA', status: 'provisoria', tipo_etiqueta: 'avulsa',
    snapshot: { operational_provisional: true, provisional_data: v, provisional_format: v.format, provisional_logo: logo,
      empresa: { nome: v.company }, produto_nome: v.product, lote_codigo: v.lot,
      recipiente: { seq: v.first + index, total: v.total },
    },
  }));
}
export function provisionalFormat(label: RecipientLabel): OperationalFormat | undefined {
  if (label.snapshot.operational_provisional !== true || label.tipo_etiqueta !== 'avulsa') return undefined;
  const data = looseLabelSchema.parse({ ...(label.snapshot.provisional_data as object), volume: String((label.snapshot.provisional_data as { volume?: unknown })?.volume) });
  if (label.trace_token || label.id || label.status !== 'provisoria') throw new Error('Etiqueta provisória não pode simular registro ou rastreio.');
  return data.format;
}