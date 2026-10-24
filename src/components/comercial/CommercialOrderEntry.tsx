import { OrderJourney } from "./OrderJourney";

export function CommercialOrderEntry() {
  return <section aria-label="Registrar venda ou pedido" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Registrar venda para cliente / parceiro</h2>
      <span role="status" className="text-sm text-muted-foreground">Início de venda indisponível nesta tela</span>
    </div>
    <details className="text-sm">
      <summary className="cursor-pointer text-primary">Detalhes do início do pedido</summary>
      <div className="space-y-2 py-2 text-muted-foreground">
        <p>Esta área analisa pedidos enviados pelos parceiros. Não há aqui um formulário autorizado para registrar uma nova venda em nome de um cliente ou parceiro.</p>
        <p>Comprar para a própria empresa é uma operação distinta, no catálogo do Portal Parceiro, quando esse portal e a criação estiverem autorizados para a identidade vinculada. Acesso comercial não concede esse acesso.</p>
        <p>O início de venda pelo comercial permanece pendente de um fluxo autorizado; não é substituído por simulação, conta financeira manual ou emissão de nota.</p>
      </div>
    </details>
    <OrderJourney />
  </section>;
}