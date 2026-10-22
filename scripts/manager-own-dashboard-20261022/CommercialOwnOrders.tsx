import { useMyCommercialOrders } from "@/hooks/useMyCommercialOrders";
import { Button } from "@/components/ui/button";
import { ownOrderIndicators } from "@/lib/comercial/ownOrderIndicators";

export function CommercialOwnOrders({ partnerId }: { partnerId: string }) {
  const orders = useMyCommercialOrders(partnerId);
  const rows = orders.ready && !orders.isError ? orders.data : undefined;
  const indicators = rows ? ownOrderIndicators(rows) : undefined;
  return <section aria-label="Pedidos próprios" className="space-y-3">
    <h2 className="text-lg font-semibold">Meus pedidos</h2>
    {!orders.ready ? <p role="status" className="text-muted-foreground">Acompanhamento indisponível.</p>
      : orders.isLoading ? <p role="status" className="text-muted-foreground">Carregando pedidos...</p>
      : orders.isError ? <div role="alert" className="space-y-2"><p>Pedidos indisponíveis no momento.</p><Button variant="outline" onClick={() => { void orders.refetch(); }}>Tentar novamente</Button></div>
      : !rows?.length ? <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
      : <>
        <dl aria-label="Situação dos pedidos exibidos" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="border border-border rounded-md p-3"><dt className="text-sm text-muted-foreground">Pedidos exibidos</dt><dd className="text-2xl font-semibold">{indicators?.observed}</dd></div>
          {indicators?.byStatus.map(item => <div key={item.status} className="border border-border rounded-md p-3"><dt className="text-sm text-muted-foreground break-words">{item.status.replace(/_/g, " ")}</dt><dd className="text-2xl font-semibold">{item.count}</dd></div>)}
        </dl>
        {indicators?.atLimit && <p className="text-sm text-muted-foreground">Últimos 100 pedidos.</p>}
        <ul className="divide-y divide-border">{rows.map(order => <li key={order.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-medium">{order.numero}</span><span className="text-muted-foreground">{order.status.replace(/_/g, " ")}</span><time className="text-sm text-muted-foreground" dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString("pt-BR")}</time></li>)}</ul>
      </>}
  </section>;
}