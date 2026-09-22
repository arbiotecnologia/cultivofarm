/**
 * Índice de comprovantes de contas a receber.
 *
 * Documentos podem estar ligados de duas formas:
 *  - direto à conta:      owner_type = "RECEIVABLE",          owner_id = accounts_receivable.id
 *  - ao evento de baixa:  owner_type = "PAYMENT_RECEIVABLE",  owner_id = receivable_payments.id
 *
 * O caminho do pagamento é resolvido por pagamento -> parcela -> conta.
 * Pagamentos estornados (ou o próprio lançamento de estorno) NÃO contam como
 * comprovante de recebimento vigente.
 */

export interface DocumentoFinanceiro {
  owner_type?: unknown;
  owner_id?: unknown;
  document_type?: unknown;
}

export interface PagamentoVinculo {
  id?: unknown;
  installment_id?: unknown;
  is_reversal?: unknown;
  reversed_payment_id?: unknown;
}

export interface ParcelaVinculo {
  id?: unknown;
  receivable_id?: unknown;
}

const s = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Ids de pagamentos cujo comprovante vale como recebimento vigente. */
export function pagamentosVigentes(pagamentos: PagamentoVinculo[]): Set<string> {
  const estornados = new Set<string>();
  for (const p of pagamentos) {
    const alvo = s(p.reversed_payment_id);
    if (alvo) estornados.add(alvo);
  }
  const vigentes = new Set<string>();
  for (const p of pagamentos) {
    const id = s(p.id);
    if (!id) continue;
    if (p.is_reversal === true) continue;
    if (estornados.has(id)) continue;
    vigentes.add(id);
  }
  return vigentes;
}

/** Mapa conta a receber -> tipos de documento vigentes. */
export function indexarComprovantesReceber(
  documentos: DocumentoFinanceiro[],
  pagamentos: PagamentoVinculo[],
  parcelas: ParcelaVinculo[],
): Record<string, string[]> {
  const contaPorParcela = new Map<string, string>();
  for (const i of parcelas) {
    const id = s(i.id);
    const conta = s(i.receivable_id);
    if (id && conta) contaPorParcela.set(id, conta);
  }

  const vigentes = pagamentosVigentes(pagamentos);
  const contaPorPagamento = new Map<string, string>();
  for (const p of pagamentos) {
    const id = s(p.id);
    if (!id || !vigentes.has(id)) continue;
    const parcela = s(p.installment_id);
    const conta = parcela ? contaPorParcela.get(parcela) : undefined;
    if (conta) contaPorPagamento.set(id, conta);
  }

  const mapa: Record<string, string[]> = {};
  for (const d of documentos) {
    const tipo = s(d.document_type);
    const owner = s(d.owner_id);
    if (!tipo || !owner) continue;
    let conta: string | undefined;
    if (d.owner_type === "RECEIVABLE") conta = owner;
    else if (d.owner_type === "PAYMENT_RECEIVABLE") conta = contaPorPagamento.get(owner);
    if (!conta) continue;
    (mapa[conta] ??= []).push(tipo);
  }
  return mapa;
}

/** Conta possui comprovante de recebimento vigente? */
export function temComprovanteRecebimento(mapa: Record<string, string[]>, contaId: string): boolean {
  return (mapa[contaId] ?? []).includes("RECEIPT");
}

export interface DocumentoAgregado {
  id: string;
  origem: "conta" | "pagamento";
  /** Número da parcela quando o documento vem de um pagamento. */
  parcelaNumero: number | null;
  /** Data do pagamento (YYYY-MM-DD) quando aplicável. */
  dataPagamento: string | null;
  /** Pagamento estornado ou lançamento de estorno. */
  estornado: boolean;
  doc: Record<string, unknown>;
}

interface DocLinha extends DocumentoFinanceiro {
  id?: unknown;
}

interface PagamentoLinha extends PagamentoVinculo {
  payment_date?: unknown;
}

interface ParcelaLinha extends ParcelaVinculo {
  installment_number?: unknown;
}

/**
 * Agrega documentos de uma conta a receber: anexados direto à conta e
 * anexados às baixas de suas parcelas. Documentos de outras contas são
 * descartados. Deduplicado por id, mantendo a primeira ocorrência.
 */
export function agregarDocumentosReceber(
  contaId: string,
  documentos: DocLinha[],
  pagamentos: PagamentoLinha[],
  parcelas: ParcelaLinha[],
): DocumentoAgregado[] {
  const parcelaPorId = new Map<string, ParcelaLinha>();
  for (const i of parcelas) {
    const id = s(i.id);
    if (id && s(i.receivable_id) === contaId) parcelaPorId.set(id, i);
  }

  const vigentes = pagamentosVigentes(pagamentos);
  const pagamentoPorId = new Map<string, PagamentoLinha>();
  for (const p of pagamentos) {
    const id = s(p.id);
    const parcela = s(p.installment_id);
    if (!id || !parcela || !parcelaPorId.has(parcela)) continue;
    pagamentoPorId.set(id, p);
  }

  const vistos = new Set<string>();
  const saida: DocumentoAgregado[] = [];
  for (const d of documentos) {
    const id = s(d.id);
    const owner = s(d.owner_id);
    if (!id || !owner || vistos.has(id)) continue;
    if (d.owner_type === "RECEIVABLE") {
      if (owner !== contaId) continue;
      vistos.add(id);
      saida.push({ id, origem: "conta", parcelaNumero: null, dataPagamento: null, estornado: false, doc: d as Record<string, unknown> });
      continue;
    }
    if (d.owner_type === "PAYMENT_RECEIVABLE") {
      const pag = pagamentoPorId.get(owner);
      if (!pag) continue;
      const parcela = parcelaPorId.get(s(pag.installment_id)!);
      const numero = Number(parcela?.installment_number);
      vistos.add(id);
      saida.push({
        id,
        origem: "pagamento",
        parcelaNumero: Number.isFinite(numero) ? numero : null,
        dataPagamento: s(pag.payment_date),
        estornado: !vigentes.has(owner),
        doc: d as Record<string, unknown>,
      });
    }
  }
  return saida;
}
