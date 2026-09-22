/**
 * Regras puras do cadastro de Conta a Receber (kind = "receivable").
 * Espelha as guardas do servidor em rpc_create_financial_title:
 * descrição, cliente, categoria ativa (RECEITA/AMBOS), valor total,
 * 1..36 parcelas inteiras, cada parcela > 0 com 2 casas, soma exata em
 * centavos e sequências 1..N.
 *
 * A semântica de contas a pagar NÃO é tratada aqui.
 */

export const PARCELAS_MIN = 1;
export const PARCELAS_MAX = 36;

export interface ParcelaNovaConta {
  installment_number: number;
  due_date: string;
  amount: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v ?? 0);
  return Number.isFinite(n) ? n : NaN;
};

/** Converte para centavos inteiros; NaN se não for valor monetário de 2 casas. */
export function paraCentavos(v: unknown): number {
  const n = num(v);
  if (!Number.isFinite(n)) return NaN;
  const c = n * 100;
  if (Math.abs(c - Math.round(c)) > 1e-6) return NaN;
  return Math.round(c);
}

export function maisDeDuasCasas(v: unknown): boolean {
  const n = num(v);
  if (!Number.isFinite(n)) return false;
  return Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
}

/** Data civil YYYY-MM-DD real (rejeita 2026-02-30). */
export function dataCivilValida(valor: unknown): boolean {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dias;
}

/** Soma meses preservando dia civil (clampa fim de mês), sem fuso do navegador. */
export function somarMesesCivil(dataIso: string, meses: number): string {
  const [y, m, d] = dataIso.split("-").map(Number);
  const totalMes = m - 1 + meses;
  const ano = y + Math.floor(totalMes / 12);
  const mes = ((totalMes % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${String(ano).padStart(4, "0")}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export interface ResultadoParcelas {
  parcelas: ParcelaNovaConta[];
  erro: string | null;
}

/**
 * Distribuição em centavos: nunca gera parcela negativa nem zero.
 * Resto é somado às primeiras parcelas (100/3 → 33,34 + 33,33 + 33,33).
 */
export function gerarParcelasReceber(total: unknown, count: unknown, primeiroVencimento: unknown): ResultadoParcelas {
  const n = Number(count);
  if (!Number.isInteger(n) || n < PARCELAS_MIN || n > PARCELAS_MAX) {
    return { parcelas: [], erro: `O número de parcelas deve ser um inteiro entre ${PARCELAS_MIN} e ${PARCELAS_MAX}.` };
  }
  const centavos = paraCentavos(total);
  if (!Number.isFinite(centavos)) {
    return { parcelas: [], erro: "Informe um valor total válido com no máximo duas casas decimais." };
  }
  if (centavos <= 0) return { parcelas: [], erro: "O valor total deve ser maior que zero." };
  if (centavos < n) {
    return { parcelas: [], erro: "O valor total é pequeno demais para esse número de parcelas." };
  }
  if (!dataCivilValida(primeiroVencimento)) {
    return { parcelas: [], erro: "Informe uma data de primeiro vencimento válida." };
  }

  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  const parcelas: ParcelaNovaConta[] = [];
  for (let i = 0; i < n; i++) {
    const c = base + (i < resto ? 1 : 0);
    parcelas.push({
      installment_number: i + 1,
      due_date: somarMesesCivil(primeiroVencimento as string, i),
      amount: c / 100,
    });
  }
  return { parcelas, erro: null };
}

export interface EntradaValidacaoNovaConta {
  temSessao: boolean;
  description: unknown;
  customer_id: unknown;
  category_id: unknown;
  /** Ids de categorias ativas (RECEITA/AMBOS) carregadas. */
  categoriasAtivas: string[];
  categoriasCarregadas: boolean;
  cost_center_id?: unknown;
  centrosAtivos?: string[];
  centrosCarregados?: boolean;
  clientesCarregados: boolean;
  total_amount: unknown;
  issue_date: unknown;
  first_due_date: unknown;
  installment_count: unknown;
  installments: ParcelaNovaConta[];
}

export class ErroNovaContaLocal extends Error {
  readonly origem = "local" as const;
}

export const MSG_NOVA_CONTA_GENERICA = "Não foi possível criar a conta. Tente novamente.";
export const MSG_NOVA_CONTA_NAO_CONFIRMADA =
  "Não foi possível confirmar se a conta foi criada. Confira a lista de contas a receber antes de tentar de novo.";

const MENSAGENS_REMOTAS: Record<string, string> = {
  FIN_TITLE_INVALID_DESCRIPTION: "Descrição inválida. Informe uma descrição para a conta.",
  FIN_TITLE_INVALID_AMOUNT: "Valor total inválido. Confira o valor informado.",
  FIN_TITLE_INVALID_COUNT: `Número de parcelas inválido. Use um valor entre ${PARCELAS_MIN} e ${PARCELAS_MAX}.`,
  FIN_TITLE_INVALID_CATEGORY: "Categoria inválida ou inativa. Selecione outra categoria.",
  FIN_TITLE_INVALID_COST_CENTER: "Centro de custo inválido ou inativo. Selecione outro.",
  FIN_TITLE_INVALID_INSTALLMENTS: "As parcelas informadas são inválidas. Revise a lista de parcelas.",
  FIN_TITLE_INVALID_INSTALLMENT: "Há uma parcela com valor ou data inválida. Revise a lista de parcelas.",
  FIN_TITLE_INVALID_SEQUENCE: "A numeração das parcelas é inválida. Refaça o parcelamento.",
  FIN_TITLE_INVALID_SUM: "A soma das parcelas difere do valor total.",
  "23514": "Os dados informados não atendem às regras da conta. Revise os campos e tente novamente.",
  "42501": "Você não tem permissão para criar esta conta.",
  "23503": "Cliente, categoria ou centro de custo não encontrado. Recarregue a página.",
  "23505": "Esta conta já foi criada. Confira a lista antes de tentar de novo.",
  P0002: "Registro não encontrado. Recarregue a página.",
};

/** Mensagem segura: local mantém o texto tipado; remoto usa allowlist, nunca texto cru. */
export function mapearErroNovaConta(erro: unknown): string {
  if (erro instanceof ErroNovaContaLocal) return erro.message;
  const e = (erro ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (code && MENSAGENS_REMOTAS[code]) return MENSAGENS_REMOTAS[code];
  const msg = typeof e.message === "string" ? e.message : "";
  const token = msg.match(/FIN_TITLE_[A-Z_]+/)?.[0];
  if (token && MENSAGENS_REMOTAS[token]) return MENSAGENS_REMOTAS[token];
  return MSG_NOVA_CONTA_GENERICA;
}

export function validarNovaContaReceber(e: EntradaValidacaoNovaConta): string | null {
  if (!e.temSessao) return "Sessão expirada. Entre novamente para criar a conta.";

  if (!e.clientesCarregados) return "Não foi possível carregar os clientes. Tente novamente.";
  if (!e.categoriasCarregadas) return "Não foi possível carregar as categorias. Tente novamente.";

  const centro = typeof e.cost_center_id === "string" ? e.cost_center_id.trim() : "";
  if (centro && e.centrosCarregados === false) return "Não foi possível carregar os centros de custo. Tente novamente.";

  const descricao = typeof e.description === "string" ? e.description.trim() : "";
  if (!descricao) return "Descrição é obrigatória.";

  const cliente = typeof e.customer_id === "string" ? e.customer_id.trim() : "";
  if (!cliente) return "Cliente é obrigatório.";

  if (!e.categoriasCarregadas) return "Não foi possível carregar as categorias. Tente novamente.";
  const categoria = typeof e.category_id === "string" ? e.category_id.trim() : "";
  if (!categoria) return "Categoria é obrigatória.";
  if (!e.categoriasAtivas.includes(categoria)) return "Categoria indisponível. Selecione outra.";

  if (centro) {
    if (e.centrosAtivos && !e.centrosAtivos.includes(centro)) return "Centro de custo indisponível. Selecione outro.";
  }

  const total = num(e.total_amount);
  if (!Number.isFinite(total)) return "Informe um valor total numérico válido.";
  if (total <= 0) return "O valor total deve ser maior que zero.";
  if (maisDeDuasCasas(e.total_amount)) return "O valor total deve ter no máximo duas casas decimais.";

  if (!dataCivilValida(e.issue_date)) return "Informe uma data de emissão válida.";
  if (!dataCivilValida(e.first_due_date)) return "Informe uma data de primeiro vencimento válida.";

  const count = Number(e.installment_count);
  if (!Number.isInteger(count) || count < PARCELAS_MIN || count > PARCELAS_MAX) {
    return `O número de parcelas deve ser um inteiro entre ${PARCELAS_MIN} e ${PARCELAS_MAX}.`;
  }

  const parcelas = e.installments ?? [];
  if (parcelas.length !== count) return "A lista de parcelas não corresponde ao número de parcelas informado.";

  let somaCent = 0;
  for (let i = 0; i < parcelas.length; i++) {
    const p = parcelas[i];
    if (!p || p.installment_number !== i + 1) return "A numeração das parcelas é inválida. Refaça o parcelamento.";
    if (!dataCivilValida(p.due_date)) return `Parcela ${i + 1}: informe uma data de vencimento válida.`;
    const c = paraCentavos(p.amount);
    if (!Number.isFinite(c)) return `Parcela ${i + 1}: use no máximo duas casas decimais.`;
    if (c <= 0) return `Parcela ${i + 1}: o valor deve ser maior que zero.`;
    somaCent += c;
  }

  const totalCent = paraCentavos(e.total_amount);
  if (!Number.isFinite(totalCent) || somaCent !== totalCent) {
    return "A soma das parcelas deve ser exatamente igual ao valor total.";
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sucesso estrito: success === true e title_id UUID válido. */
export function criacaoBemSucedida(resposta: unknown): boolean {
  const r = (Array.isArray(resposta) ? resposta[0] : resposta) as
    | { success?: unknown; title_id?: unknown }
    | null
    | undefined;
  if (!r || typeof r !== "object") return false;
  if (r.success !== true) return false;
  return typeof r.title_id === "string" && UUID_RE.test(r.title_id);
}
