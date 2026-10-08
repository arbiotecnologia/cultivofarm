import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Motor canônico de movimentações de estoque (Fase 2).
 *
 * Toda alteração de saldo, reserva, volume ou situação de `estoque_produto`
 * deve passar por `rpc_estoque_operar_v1`. UPDATE direto é bloqueado no banco
 * pela guarda `fn_estoque_produto_guard`.
 */
export type EstoqueAcao =
  | "reserva"
  | "cancelamento_reserva"
  | "expedicao"
  | "entrega"
  | "estorno_expedicao"
  | "ajuste"
  | "perda"
  | "descarte"
  | "devolucao";

export type EstoqueReferenciaTipo =
  | "entrega"
  | "ordem_servico"
  | "ordem_servico_onfarm"
  | "partner_order"
  | "envase"
  | "lote"
  | "manual"
  | "sistema";

export interface EstoqueOperacaoPayload {
  motivo?: string | null;
  observacao?: string | null;
  origem?: string;
  referencia_tipo?: EstoqueReferenciaTipo;
  referencia_id?: string | null;
  os_id?: string | null;
  os_tipo?: string | null;
  cliente_id?: string | null;
  partner_id?: string | null;
  partner_order_id?: string | null;
  movimentacao_origem_id?: string | null;
  classificacao?: "reintegravel" | "quarentena" | "descarte" | "reprocesso";
  sentido?: "entrada" | "saida";
  unidade?: string;
  metadata?: Record<string, unknown>;
}

export interface EstoqueOperacaoResultado {
  ok: boolean;
  replay: boolean;
  acao: EstoqueAcao;
  movimentacao_id: string;
  estoque_produto_id: string;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
  reservado_anterior: number | null;
  reservado_posterior: number | null;
  status_anterior: string | null;
  status_novo: string | null;
  quantidade?: number | null;
  unidade?: string | null;
}

/** Erros de negócio do motor, para tratamento de UI (conflito, permissão, saldo). */
export class EstoqueMotorError extends Error {
  readonly codigo: string;
  constructor(message: string) {
    super(message);
    this.name = "EstoqueMotorError";
    this.codigo = /ESTQ_[A-Z_]+/.exec(message)?.[0] ?? "ESTQ_ERRO";
  }
  get isConflito() {
    return this.codigo === "ESTQ_IDEMPOTENCY_CONFLITO";
  }
  get isPermissao() {
    return ["ESTQ_SEM_PERMISSAO", "ESTQ_ESCOPO_INVALIDO", "ESTQ_NAO_AUTENTICADO", "ESTQ_IDENTIDADE_INATIVA", "ESTQ_FEATURE_REQUIRED", "ESTQ_TENANT_FORBIDDEN", "ESTQ_REFERENCE_FORBIDDEN"].includes(this.codigo);
  }
}

/** Chave de idempotência determinística: mesma operação lógica = mesma chave. */
export function chaveIdempotencia(...partes: (string | number | null | undefined)[]) {
  return partes.filter((p) => p !== null && p !== undefined && p !== "").join(":");
}

export async function operarEstoque(
  acao: EstoqueAcao,
  itemId: string,
  quantidade: number | null,
  idempotencyKey: string,
  payload: EstoqueOperacaoPayload = {},
): Promise<EstoqueOperacaoResultado> {
  const { data, error } = await supabase.rpc("rpc_estoque_operar_v1", {
    p_acao: acao,
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_idempotency_key: idempotencyKey,
    p_payload: payload as unknown as Json,
  });
  if (error) throw new EstoqueMotorError(error.message);
  return data as unknown as EstoqueOperacaoResultado;
}

/** Mensagem amigável por código de erro do motor. */
export function mensagemErroEstoque(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const mapa: Record<string, string> = {
    ESTQ_NAO_AUTENTICADO: "Entre novamente para realizar esta operação de estoque.",
    ESTQ_IDENTIDADE_INATIVA: "Sua sessão ou empresa não está habilitada para esta operação.",
    ESTQ_FEATURE_REQUIRED: "O plano da sua empresa não habilita esta operação de estoque.",
    ESTQ_TENANT_FORBIDDEN: "Este item não está disponível para a sua empresa.",
    ESTQ_REFERENCE_FORBIDDEN: "Os vínculos informados não são válidos para esta operação.",
    ESTQ_REFERENCE_UNSUPPORTED: "Este tipo de vínculo ainda não está habilitado para esta operação.",
    ESTQ_PAYLOAD_INVALIDO: "Os dados informados para esta operação são inválidos.",
    ESTQ_QUANTIDADE_INVALIDA: "Informe uma quantidade finita e maior que zero.",
    ESTQ_ESTORNO_ORIGEM_INVALIDA: "A movimentação de origem não é válida para este estorno.",
    ESTQ_SEM_TRILHA: "Não foi possível confirmar o registro da movimentação. A operação foi revertida.",
    ESTQ_SEM_PERMISSAO: "Seu perfil não tem permissão para esta operação de estoque.",
    ESTQ_ESCOPO_INVALIDO: "Este item pertence a outro cliente, OS ou pedido.",
    ESTQ_SALDO_INSUFICIENTE: "Saldo insuficiente para concluir a operação.",
    ESTQ_IDEMPOTENCY_CONFLITO: "Operação já registrada com dados diferentes. Recarregue a página.",
    ESTQ_ESTORNO_DUPLICADO: "Esta movimentação já foi estornada.",
    ESTQ_ESTORNO_DE_ESTORNO: "Não é possível estornar um estorno.",
    ESTQ_MOTIVO_OBRIGATORIO: "Informe o motivo da operação.",
    ESTQ_APROVACAO_REQUERIDA: "Redução acima do limite: requer aprovação de administrador ou gestor.",
    ESTQ_UPDATE_DIRETO_BLOQUEADO: "Alteração de saldo só é permitida pelas operações oficiais de estoque.",
    ESTQ_DEVOLUCAO_CQ: "Lote sem CQ aprovado não pode voltar ao estoque comercial.",
    ESTQ_DEVOLUCAO_VALIDADE: "Item vencido não pode ser reintegrado.",
  };
  const codigo = /ESTQ_[A-Z_]+/.exec(msg)?.[0];
  return (codigo && mapa[codigo]) || msg;
}
