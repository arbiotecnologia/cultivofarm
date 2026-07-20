// Compartilhado entre /ordens-servico e telas de detalhe (cliente/parceiro)
export const STATUS_PIPELINE = [
  { key: "aberta", label: "Aberta", color: "bg-muted text-muted-foreground" },
  { key: "aprovada", label: "Aprovada", color: "bg-status-producao/10 text-status-producao" },
  { key: "programada", label: "Programada", color: "bg-status-producao/20 text-status-producao" },
  { key: "em_producao", label: "Em Produção", color: "bg-status-producao/30 text-status-producao" },
  { key: "em_cq", label: "Em CQ", color: "bg-status-cq/20 text-status-cq" },
  { key: "envase", label: "Envase", color: "bg-status-entrega/10 text-status-entrega" },
  { key: "pronto_entrega", label: "Pronto Entrega", color: "bg-status-aprovado/10 text-status-aprovado" },
  { key: "entregue", label: "Entregue", color: "bg-status-aprovado/20 text-status-aprovado" },
  { key: "finalizada", label: "Finalizada", color: "bg-primary/10 text-primary" },
] as const;

export function osStatusInfo(status: string) {
  return STATUS_PIPELINE.find((s) => s.key === status) ?? { key: status, label: status, color: "bg-muted text-muted-foreground" };
}

export function etapaFromStatus(status: string): { key: string; label: string; color: string } {
  switch (status) {
    case "aberta":
    case "aprovada":
    case "programada":
      return { key: "pcp", label: "PCP / Programação", color: "bg-muted text-muted-foreground" };
    case "em_producao":
      return { key: "producao", label: "Em Produção", color: "bg-status-producao/15 text-status-producao" };
    case "em_cq":
      return { key: "cq", label: "Controle de Qualidade", color: "bg-status-cq/15 text-status-cq" };
    case "envase":
      return { key: "envase", label: "Envase", color: "bg-orange-100 text-orange-700" };
    case "pronto_entrega":
      return { key: "estoque", label: "Estoque / Reserva", color: "bg-blue-100 text-blue-700" };
    case "entregue":
      return { key: "entrega", label: "Entrega", color: "bg-purple-100 text-purple-700" };
    case "finalizada":
      return { key: "finalizada", label: "Finalizada", color: "bg-primary/10 text-primary" };
    default:
      return { key: "desconhecido", label: status, color: "bg-muted text-muted-foreground" };
  }
}

export const prioridadeMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  baixa: { label: "Baixa", variant: "secondary" },
  media: { label: "Média", variant: "default" },
  alta: { label: "Alta", variant: "destructive" },
};
