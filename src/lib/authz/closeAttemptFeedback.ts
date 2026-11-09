import type { CloseAttemptResult } from "@/hooks/useCloseOrderAttempt";

/**
 * Mensagem visível do clique explícito "Verificar e encerrar envio anterior".
 * Somente informa; nunca libera chave, nunca reenvia e nunca infere fechamento.
 */
export function closeAttemptFeedback(r: CloseAttemptResult): { tone: "success" | "info" | "error"; text: string } {
  switch (r.kind) {
    case "closed": return { tone: "success", text: "Tentativa anterior encerrada sem pedido. Você pode iniciar uma nova tentativa." };
    case "committed": return { tone: "info", text: `O envio anterior gerou o pedido ${r.numero}. Consulte Meus Pedidos antes de iniciar outro.` };
    case "in_progress": return { tone: "info", text: "O envio anterior ainda está em processamento. Aguarde e verifique novamente." };
    case "context_changed": return { tone: "error", text: "Sua sessão ou empresa mudou durante a verificação. Nada foi liberado; verifique novamente." };
    case "not_eligible": return { tone: "error", text: "Não há tentativa elegível para encerrar nesta sessão. Nada foi liberado." };
    default: return { tone: "error", text: "Não foi possível confirmar o envio anterior (sem permissão ou sem resposta do servidor). Nada foi liberado." };
  }
}
