/**
 * H9-GR — tradução de códigos técnicos das RPCs de visita para mensagens
 * amigáveis em português.
 *
 * Regra: a UI nunca exibe o código cru (ex.: `checkin_duplicado_para_tipo_no_ciclo`).
 * O código técnico permanece disponível para log interno via `codigoTecnicoVisita`.
 */

const MENSAGENS: Record<string, string> = {
  checkin_duplicado_para_tipo_no_ciclo:
    "Este check-in já foi registrado para esta visita. Não é necessário repetir.",
  checkout_duplicado: "A saída desta visita já foi registrada.",
  checkout_sem_checkin: "Faça o check-in antes de registrar a saída.",
  idempotency_conflict:
    "Já existe um registro diferente para esta operação. Atualize a tela e tente novamente.",
  forbidden_visita_nao_atribuido:
    "Você não tem permissão para registrar esta visita.",
  not_visit_owner: "Você não tem permissão para registrar esta visita.",
  sem_permissao: "Você não tem permissão para esta ação.",
  unauthenticated: "Sessão expirada. Entre novamente para continuar.",
  gps_ou_justificativa_obrigatorio:
    "Sem GPS disponível: informe uma justificativa para continuar.",
  client_uuid_obrigatorio: "Não foi possível identificar a operação. Tente novamente.",
  registro_obrigatorio: "Selecione uma visita antes de continuar.",
  registro_nao_encontrado: "Visita não encontrada.",
  visita_nao_editavel: "Esta visita já foi concluída e não pode mais ser alterada.",
  version_conflict:
    "Esta visita foi atualizada em outro dispositivo. Atualize a tela e tente novamente.",
  transicao_invalida:
    "Esta visita mudou de etapa. Atualize a tela para ver o estado atual.",
  cultura_obrigatoria: "Informe a cultura antes de finalizar a visita.",
  diagnostico_obrigatorio: "Registre pelo menos um diagnóstico antes de finalizar.",
  checkin_obrigatorio: "Faça o check-in antes de finalizar a visita.",
  checkin_no_futuro: "Horário do check-in inválido. Verifique a data do aparelho.",
  relacional_divergente_cliente: "Dados do cliente não conferem com esta visita.",
  relacional_divergente_fazenda: "Dados da fazenda não conferem com esta visita.",
  relacional_divergente_talhao: "Dados do talhão não conferem com esta visita.",
  relacional_divergente_solicitacao:
    "Dados da solicitação não conferem com esta visita.",
  use_rpc_realizar_checkout_visita:
    "Para encerrar a visita, use a opção de saída.",
};

export function codigoTecnicoVisita(err: unknown): string | null {
  const msg =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && typeof (err as any).message === "string"
        ? (err as any).message
        : "";
  if (!msg) return null;
  const hit = Object.keys(MENSAGENS).find((code) => msg.includes(code));
  return hit ?? null;
}

/**
 * Retorna a mensagem amigável quando o erro corresponde a um código conhecido.
 * Caso contrário devolve `fallback` (sem expor o código cru).
 */
export function mensagemAmigavelVisita(
  err: unknown,
  fallback = "Não foi possível concluir a operação. Tente novamente.",
): string {
  const codigo = codigoTecnicoVisita(err);
  return codigo ? MENSAGENS[codigo] : fallback;
}

export const CODIGOS_VISITA_MAPEADOS = Object.keys(MENSAGENS);
