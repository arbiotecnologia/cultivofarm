/**
 * Fase 12.8 · Grupo A — Rotas oficiais /app/visita/novo e /app/visita/:id
 * agora renderizam o wizard mobile nativo (7 etapas, Etapa 1 funcional).
 *
 * A antiga rota `/visita-tecnica/*` continua ativa para desktop/tablet e
 * deep-links legados — nenhum redirect é aplicado aqui.
 */
import MobileVisitaWizard from "./MobileVisitaWizard";

export default function MobileVisita() {
  return <MobileVisitaWizard />;
}
