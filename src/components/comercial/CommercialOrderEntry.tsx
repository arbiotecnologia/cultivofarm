import { OrderJourney } from "./OrderJourney";

export function CommercialOrderEntry() {
  return <section aria-label="Registrar venda ou pedido" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Registrar venda para cliente / parceiro</h2>
      <span role="status" className="text-sm text-muted-foreground">Início de venda pelo comercial ainda não liberado pelo servidor</span>
    </div>
    <details className="text-sm">
      <summary className="cursor-pointer text-primary">Detalhes das pendências</summary>
      <div className="space-y-2 py-2 text-muted-foreground">
        <p>Esta área analisa pedidos enviados pelos parceiros. O registro de venda pelo comercial usará o mesmo pedido, simulação e envio do Portal Parceiro, sem formulário paralelo.</p>
        <p>Hoje o servidor só aceita pedido do comercial para o parceiro vinculado à própria empresa, não para outros parceiros ou clientes da carteira. Liberar a venda para a carteira depende de uma regra nova no servidor, ainda em revisão.</p>
        <p>Além disso, pedidos de origem interna exigem a configuração fiscal da empresa emissora validada pela contabilidade. Essa validação está pendente e não é feita nesta tela.</p>
        <p>Comprar para a própria empresa continua sendo feito no catálogo do Portal Parceiro, quando esse acesso estiver autorizado. Acesso comercial, técnico ou financeiro não concede essa compra.</p>
      </div>
    </details>
    <OrderJourney />
  </section>;
}
