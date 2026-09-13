// Contrato de consulta/histórico do Controle de Qualidade.
// Somente leitura: nenhuma função aqui altera dados; registro e avanço de etapa
// pertencem ao Cockpit Laboratório.

export type ResultadoCQ = 'aprovado' | 'reprovado' | null;
export type EstadoConformidade = 'conforme' | 'nao_conforme' | 'indeterminado';

export const normalizar = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function diaSP(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function dataCQ(value: string | null | undefined) {
  const day = diaSP(value);
  return day ? day.split('-').reverse().join('/') : '—';
}

export function dataHoraCQ(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

/** Aceita zero e negativos; rejeita nulo, não numérico, NaN e infinitos. */
export function numeroFinito(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatNumero(value: unknown, casas = 2) {
  const n = numeroFinito(value);
  return n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function noPeriodo(value: string | null | undefined, inicio: string, fim: string) {
  if (!inicio && !fim) return true;
  const day = diaSP(value);
  return !!day && (!inicio || day >= inicio) && (!fim || day <= fim);
}

export function statusCQ(resultado: ResultadoCQ | string | null | undefined) {
  return resultado === 'aprovado' || resultado === 'reprovado' ? resultado : 'pendente';
}

export const ROTULO_RESULTADO: Record<string, string> = {
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  pendente: 'Pendente de parecer',
};

export interface Referencia {
  microrganismo_id: string;
  produto_id: string | null;
  ph_min: number | null;
  ph_max: number | null;
  concentracao_min_ufc_ml: number | null;
  aparencia_esperada: string | null;
  odor_esperado: string | null;
  contaminacao_esperada: string | null;
  ativo?: boolean;
}

/** Referência mais específica primeiro (produto), depois a do microrganismo. */
export function selecionarReferencia(
  refs: Referencia[],
  microrganismoId: string | null | undefined,
  produtoId: string | null | undefined,
): Referencia | null {
  if (!microrganismoId) return null;
  const ativos = refs.filter(r => r.ativo !== false && r.microrganismo_id === microrganismoId);
  return (produtoId && ativos.find(r => r.produto_id === produtoId))
    || ativos.find(r => r.produto_id === null)
    || null;
}

/** Limites inclusivos; ausência de limite ou de valor é indeterminada, nunca conforme. */
export function avaliarFaixa(valor: unknown, min: unknown, max: unknown): EstadoConformidade {
  const v = numeroFinito(valor), lo = numeroFinito(min), hi = numeroFinito(max);
  if (v === null || (lo === null && hi === null)) return 'indeterminado';
  if (lo !== null && hi !== null && lo > hi) return 'indeterminado';
  if (lo !== null && v < lo) return 'nao_conforme';
  if (hi !== null && v > hi) return 'nao_conforme';
  return 'conforme';
}

export function avaliarMinimo(valor: unknown, min: unknown): EstadoConformidade {
  const v = numeroFinito(valor), lo = numeroFinito(min);
  if (v === null || lo === null) return 'indeterminado';
  return v >= lo ? 'conforme' : 'nao_conforme';
}

export function avaliarTexto(valor: string | null | undefined, esperado: string | null | undefined): EstadoConformidade {
  if (!valor?.trim() || !esperado?.trim()) return 'indeterminado';
  return normalizar(valor) === normalizar(esperado) ? 'conforme' : 'nao_conforme';
}

export const ROTULO_CONFORMIDADE: Record<EstadoConformidade, string> = {
  conforme: 'Dentro do limite',
  nao_conforme: 'Fora do limite',
  indeterminado: 'Sem limite cadastrado',
};

export function faixaTexto(min: unknown, max: unknown, unidade = '') {
  const lo = numeroFinito(min), hi = numeroFinito(max);
  const sufixo = unidade ? ` ${unidade}` : '';
  if (lo === null && hi === null) return 'Sem limite cadastrado';
  if (lo !== null && hi !== null) return `${formatNumero(lo)} a ${formatNumero(hi)}${sufixo}`;
  return lo !== null ? `≥ ${formatNumero(lo)}${sufixo}` : `≤ ${formatNumero(hi)}${sufixo}`;
}

/** Divergências entre o parecer registrado e as medições/status do lote. */
export function divergencias(
  resultado: ResultadoCQ | string | null | undefined,
  estados: EstadoConformidade[],
  statusLote?: string | null,
): string[] {
  const status = statusCQ(resultado);
  const avisos: string[] = [];
  if (status === 'aprovado' && estados.includes('nao_conforme')) {
    avisos.push('Parecer aprovado com parâmetro fora do limite de referência.');
  }
  if (status === 'reprovado' && estados.length > 0 && estados.every(e => e === 'conforme')) {
    avisos.push('Parecer reprovado sem parâmetro fora do limite de referência.');
  }
  if (status === 'pendente') {
    avisos.push('Análise sem parecer final registrado.');
  }
  if (statusLote && status !== 'pendente' && statusLote !== status
      && (statusLote === 'aprovado' || statusLote === 'reprovado')) {
    avisos.push(`Parecer da análise (${ROTULO_RESULTADO[status]}) diverge do status do lote.`);
  }
  return avisos;
}

/** Navegação contextual para o Cockpit, sempre com parâmetro codificado. */
export function cockpitCQ(osId?: string | null) {
  return osId ? `/cockpit-laboratorio?os=${encodeURIComponent(osId)}` : '/cockpit-laboratorio';
}

export function vinculoOS(prog?: { ordem_servico_id: string | null; ordem_servico_onfarm_id: string | null } | null, temProgramacao = true) {
  if (!temProgramacao) return { osId: null as string | null, aviso: 'Lote sem programação vinculada' };
  if (!prog) return { osId: null as string | null, aviso: 'Programação ausente ou indisponível' };
  if (prog.ordem_servico_id && prog.ordem_servico_onfarm_id) {
    return { osId: null as string | null, aviso: 'Vínculo de OS ambíguo' };
  }
  const osId = prog.ordem_servico_id || prog.ordem_servico_onfarm_id || null;
  return { osId, aviso: osId ? undefined : 'OS não vinculada' };
}
