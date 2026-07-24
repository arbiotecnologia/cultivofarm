/**
 * Fase SINIEF 3 — Mapper futuro CanonicalDraft → row de persistência.
 *
 * ATENÇÃO: este módulo está DESABILITADO. Não é chamado pelo painel nem
 * pelo wizard. Ele documenta a conversão de campos textuais (`tpNFDebito`,
 * `tpNFCredito`) para `smallint` no limite exato de persistência, mantendo
 * o zero à esquerda intacto no domínio.
 *
 * Nenhuma linha aqui faz I/O, insere, atualiza ou envia XML. A migration
 * SINIEF 49 ainda não foi aplicada e `types.ts` do Supabase não foi
 * regenerado — portanto o mapper só existe como contrato + teste.
 */
import type { CanonicalDraft } from "./types";

/** Marca conservadora para tornar impossível chamar acidentalmente. */
export const PERSISTENCE_MAPPER_ENABLED = false as const;

/**
 * Converte um código textual com zero à esquerda (`"03"`, `"04"`, `"06"`,
 * `"07"`) para `smallint`. O domínio SEMPRE mantém a string original; a
 * perda do zero acontece apenas na borda de persistência.
 */
export function tpNfCodeToSmallint(code: string | null | undefined): number | null {
  if (code === null || code === undefined || code === "") return null;
  if (!/^[0-9]{1,3}$/.test(code)) {
    throw new Error(`Código tpNF* inválido: ${JSON.stringify(code)}`);
  }
  const n = Number.parseInt(code, 10);
  if (!Number.isInteger(n) || n < 0 || n > 999) {
    throw new Error(`Código tpNF* fora do domínio smallint: ${JSON.stringify(code)}`);
  }
  return n;
}

export interface FiscalInvoiceInsertShape {
  direction: "OUT" | "IN";
  fiscal_operation_type: CanonicalDraft["operationType"];
  fin_nfe: number;
  tp_nf_debito: number | null;
  tp_nf_credito: number | null;
  nature_operation: string;
  legal_basis: string;
  legal_version: string;
  legal_effective_date: string;
  justificativa: string | null;
}

/**
 * Contrato do mapeamento; **não é chamado** por nenhum caminho em runtime.
 * Serve como referência para o momento em que a migration for aplicada e
 * `types.ts` regenerado.
 */
export function mapDraftToInvoiceInsert(
  draft: CanonicalDraft,
): FiscalInvoiceInsertShape {
  if (PERSISTENCE_MAPPER_ENABLED) {
    // Guarda dupla: mesmo com a flag ligada, este caminho não persiste
    // — apenas retorna o shape. Requerimento explícito da Fase 3.
  }
  return {
    direction: draft.direction,
    fiscal_operation_type: draft.operationType,
    fin_nfe: draft.finNFe,
    tp_nf_debito: tpNfCodeToSmallint(draft.tpNFDebito),
    tp_nf_credito: tpNfCodeToSmallint(draft.tpNFCredito),
    nature_operation: draft.natureOperation,
    legal_basis: draft.legal.basis,
    legal_version: draft.legal.version,
    legal_effective_date: draft.legal.effectiveDate,
    justificativa: draft.taxAuthorityNotes,
  };
}
