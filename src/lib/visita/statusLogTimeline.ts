/**
 * H9-G bloco 2B — leitura canônica dos registros de `registros_consultor_status_log`
 * para a timeline da visita.
 *
 * Regra de domínio: quando `status_anterior === status_novo` (tipicamente
 * finalizado → finalizado), não houve mudança de status e sim uma EDIÇÃO
 * JUSTIFICADA da visita já finalizada. A timeline deve rotular assim e exibir o
 * motivo informado, o autor (quando conhecido) e a data — sem expor identificadores
 * técnicos como UUID de usuário.
 */

export interface StatusLogEntrada {
  status_anterior?: string | null;
  status_novo?: string | null;
  motivo?: string | null;
  autorNome?: string | null;
}

export interface StatusLogDescricao {
  title: string;
  detail?: string;
  isEdicaoJustificada: boolean;
}

export function descreverStatusLog(
  log: StatusLogEntrada,
  labelDe: (status?: string | null) => string,
): StatusLogDescricao {
  const anterior = log.status_anterior ?? null;
  const novo = log.status_novo ?? null;
  const isEdicaoJustificada = !!anterior && !!novo && anterior === novo;

  const partes: string[] = [];
  const motivo = (log.motivo ?? "").trim();
  if (motivo) partes.push(`Motivo: ${motivo}`);
  const autor = (log.autorNome ?? "").trim();
  if (autor) partes.push(`por ${autor}`);

  return {
    title: isEdicaoJustificada
      ? `Edição justificada (${labelDe(novo)})`
      : `Status: ${anterior ? labelDe(anterior) : "—"} → ${labelDe(novo)}`,
    detail: partes.length ? partes.join(" · ") : undefined,
    isEdicaoJustificada,
  };
}
