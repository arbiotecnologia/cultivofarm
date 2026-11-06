/**
 * Estado da simulação do plano B2B: chave de contexto e mensagem de falha.
 * A simulação é somente leitura no servidor; aqui só decidimos qual resposta pode ser adotada
 * (a da chave atual) e o que mostrar ao comprador quando ela falha. Nunca inventa valores.
 */
export interface SimulationContext {
  userId: string | null | undefined;
  organizationId: string | null | undefined;
  partnerId: string | null | undefined;
  planId: string | null | undefined;
  items: ReadonlyArray<Record<string, unknown>>;
}

export function simulationKey(c: SimulationContext): string | null {
  if (!c.userId || !c.organizationId || !c.partnerId || !c.planId || c.items.length === 0) return null;
  return JSON.stringify([c.userId, c.organizationId, c.partnerId, c.planId, c.items]);
}

export interface SimulationFailure {
  key: string;
  title: string;
  detail: string;
  code: string | null;
  retryable: boolean;
}

function errField(e: unknown, f: "code" | "message"): string {
  if (e && typeof e === "object" && f in e) {
    const v = (e as Record<string, unknown>)[f];
    return typeof v === "string" ? v : "";
  }
  return "";
}

export function describeSimulationFailure(key: string, error: unknown): SimulationFailure {
  const code = errField(error, "code") || null;
  const msg = errField(error, "message");
  const base = { key, code };
  if (/tenant_catalog_fence_denied|b2b_catalog_item_denied/.test(msg)) {
    return { ...base, title: "Não foi possível calcular a condição para estes itens.",
      detail: "O servidor não autorizou o preço de um ou mais itens do carrinho para esta conta. Nenhum valor foi aplicado. Se persistir, informe a empresa fornecedora.",
      retryable: true };
  }
  if (/payment_method_stale/.test(msg)) {
    return { ...base, title: "A configuração deste meio de pagamento mudou.",
      detail: "A empresa fornecedora atualizou o meio escolhido. Recarregue as opções e escolha novamente. Nenhum valor foi aplicado.", retryable: false };
  }
  if (/payment_method_(unavailable|required|installments_incompatible|price_interest_conflict|rolled_back)|b2b_payment_method_rolled_back/.test(msg)) {
    return { ...base, title: "Meio de pagamento indisponível para esta condição.",
      detail: "Escolha outro meio entre os permitidos pela empresa fornecedora. Nenhum valor foi aplicado.", retryable: false };
  }
  if (code === "42501" || /forbidden|denied|auth_required/.test(msg)) {
    return { ...base, title: "Sem permissão para simular esta condição.",
      detail: "Sua conta não está autorizada a ver esta condição de pagamento agora. Nenhum valor foi aplicado.", retryable: true };
  }
  if (/PACKAGING|ITEM_WITHOUT_PRICE|price/i.test(msg)) {
    return { ...base, title: "Um item do carrinho está sem preço válido.",
      detail: "Revise as embalagens e volumes do carrinho. Nenhum valor foi aplicado.", retryable: true };
  }
  return { ...base, title: "Não foi possível calcular a condição de pagamento.",
    detail: "Falha temporária ou de conexão. Nenhum valor foi aplicado; tente novamente.", retryable: true };
}
