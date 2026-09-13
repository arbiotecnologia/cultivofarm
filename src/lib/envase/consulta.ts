// Contrato puro do módulo Envase (consulta, elegibilidade e validações).
// Nenhuma função aqui acessa banco: a autoridade continua sendo a RPC
// canônica rpc_cockpit_registrar_envase_v1 e as constraints de public.envase.

export const PAGINA_ENVASE = 50;

/** Faixa [from, to] para range() do PostgREST (paginação server-side). */
export function faixaDaPagina(pagina: number, tamanho = PAGINA_ENVASE) {
  const p = Number.isFinite(pagina) && pagina > 0 ? Math.floor(pagina) : 1;
  const from = (p - 1) * tamanho;
  return { from, to: from + tamanho - 1 };
}

export function totalDePaginas(total: number, tamanho = PAGINA_ENVASE) {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / tamanho));
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Período inválido nunca pode virar "nenhum envase registrado": a tela precisa
 * bloquear a consulta e exibir a mensagem.
 */
export function validarPeriodo(
  inicio: string,
  fim: string,
): { valido: boolean; mensagem: string | null } {
  if (inicio && !ISO_DIA.test(inicio)) return { valido: false, mensagem: "Data inicial inválida." };
  if (fim && !ISO_DIA.test(fim)) return { valido: false, mensagem: "Data final inválida." };
  if (inicio && fim && inicio > fim) {
    return { valido: false, mensagem: "A data inicial não pode ser posterior à data final." };
  }
  return { valido: true, mensagem: null };
}

export interface RegistroCQ {
  id?: string | null;
  created_at?: string | null;
  data_analise?: string | null;
  seq?: number | null;
  resultado?: string | null;
}

const tempo = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Compara datas tratando ausência como "mais antiga", sem produzir NaN. */
const cmpData = (a: string | null | undefined, b: string | null | undefined) => {
  const ta = tempo(a);
  const tb = tempo(b);
  if (ta === tb) return 0;
  if (ta === null) return -1;
  if (tb === null) return 1;
  return ta < tb ? -1 : 1;
};

/**
 * Último CQ de forma determinística: created_at DESC, seq DESC e, na ausência
 * de `seq` no schema atual, data_analise DESC e id DESC como desempate estável.
 */
export function ultimoCQ(lista: RegistroCQ[] | null | undefined): RegistroCQ | null {
  const itens = (lista ?? []).filter(Boolean);
  if (itens.length === 0) return null;
  return [...itens].sort((a, b) => {
    const dt = cmpData(b.created_at, a.created_at);
    if (dt !== 0) return dt;
    const sa = Number.isFinite(Number(a.seq)) ? Number(a.seq) : Number.NEGATIVE_INFINITY;
    const sb = Number.isFinite(Number(b.seq)) ? Number(b.seq) : Number.NEGATIVE_INFINITY;
    if (sa !== sb) return sb - sa;
    const dd = cmpData(b.data_analise, a.data_analise);
    if (dd !== 0) return dd;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  })[0];
}

/** Só o ÚLTIMO parecer conta. CQ aprovado antigo não reabre o lote. */
export function ultimoCQAprovado(lista: RegistroCQ[] | null | undefined): boolean {
  return ultimoCQ(lista)?.resultado === "aprovado";
}

export interface LoteComplementoInput {
  status?: string | null;
  cqs?: RegistroCQ[] | null;
  saldoMl: number;
  jaIniciado: boolean;
}

/** Elegibilidade local; o banco permanece como autoridade final. */
export function podeComplementar({ status, cqs, saldoMl, jaIniciado }: LoteComplementoInput): boolean {
  if (status !== "aprovado") return false;
  if (!ultimoCQAprovado(cqs)) return false;
  if (!jaIniciado) return false;
  return Number.isFinite(saldoMl) && saldoMl > 0;
}

export function volumeEnvasadoMl(
  envases: { volume_por_unidade?: number | null; quantidade?: number | null }[] | null | undefined,
): number {
  return (envases ?? []).reduce((s, e) => {
    const v = Number(e?.volume_por_unidade);
    const q = Number(e?.quantidade);
    if (!Number.isFinite(v) || !Number.isFinite(q)) return s;
    return s + v * q;
  }, 0);
}

export function saldoMl(produzidoMl: unknown, envases: Parameters<typeof volumeEnvasadoMl>[0]): number {
  const p = Number(produzidoMl);
  return (Number.isFinite(p) ? p : 0) - volumeEnvasadoMl(envases);
}

/** Quantidade precisa ser inteira e estritamente positiva (constraint do banco). */
export function quantidadeInteiraPositiva(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor.trim()) : Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Validade precisa ser um dia civil estritamente futuro. */
export function validadeFutura(valor: string, hojeISO: string): boolean {
  if (!ISO_DIA.test(valor) || !ISO_DIA.test(hojeISO)) return false;
  return valor > hojeISO;
}

export function hojeLocalISO(base = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}
