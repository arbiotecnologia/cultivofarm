/**
 * Semântica do desfecho da visita técnica (H9-G bloco 2A).
 *
 * Regra de domínio: apenas desfechos que produzem um artefato aprovável
 * (recomendação técnica ou OS de Produção) seguem para aprovação técnica e
 * liberação ao produtor. Desfechos de acompanhamento — apenas monitorar ou
 * programar nova visita — encerram o ciclo na finalização e NÃO podem
 * oferecer ações de aprovação/liberação.
 *
 * Este módulo é puro e é a fonte única usada pela UI para decidir o texto e a
 * disponibilidade dessas ações.
 */

export type ProximoPassoVisita =
  | "emitir_recomendacao"
  | "gerar_os"
  | "monitorar_area"
  | "programar_nova_visita"
  | (string & {});

const DESFECHOS_APROVAVEIS = new Set<string>(["emitir_recomendacao", "gerar_os"]);

/** Desfecho gera artefato que passa por aprovação técnica / liberação ao produtor. */
export function desfechoGeraArtefatoAprovavel(
  proximoPasso?: ProximoPassoVisita | null,
): boolean {
  if (!proximoPasso) return false;
  return DESFECHOS_APROVAVEIS.has(proximoPasso);
}

/** Texto do banner para uma visita já finalizada, coerente com o desfecho. */
export function descricaoVisitaFinalizada(
  proximoPasso?: ProximoPassoVisita | null,
): string {
  switch (proximoPasso) {
    case "emitir_recomendacao":
      return "Recomendação pronta para envio à aprovação técnica.";
    case "gerar_os":
      return "OS de Produção pronta para envio à aprovação técnica.";
    case "monitorar_area":
      return "Desfecho: apenas monitorar. Não há recomendação nem OS para aprovar; acompanhe o plano de monitoramento.";
    case "programar_nova_visita":
      return "Desfecho: retorno técnico programado. Não há recomendação nem OS para aprovar.";
    default:
      return "Visita finalizada e registrada. Nenhum artefato aprovável foi gerado neste desfecho.";
  }
}

/** Etapa ativa do mini fluxo, considerando o desfecho. */
export function etapaAtivaFinalizada(
  proximoPasso?: ProximoPassoVisita | null,
): "aprovacao" | "concluida" {
  return desfechoGeraArtefatoAprovavel(proximoPasso) ? "aprovacao" : "concluida";
}
