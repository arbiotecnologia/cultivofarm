import { useMyCommercialOrders } from "@/hooks/useMyCommercialOrders";
import { Button } from "@/components/ui/button";

export function CommercialOwnOrders({ partnerId }: { partnerId: string }) {
  const orders = useMyCommercialOrders(partnerId);
  return <section aria-label="Pedidos próprios" className="space-y-3">
    <h2 className="text-lg font-semibold">Meus pedidos</h2>
    {orders.isLoading ? <p role="status" className="text-muted-foreground">Carregando pedidos...</p>
      : orders.isError ? <div role="alert" className="space-y-2"><p>Pedidos indisponíveis no momento.</p><Button variant="outline" onClick={() => { void orders.refetch(); }}>Tentar novamente</Button></div>
      : !orders.data?.length ? <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
      : <ul className="divide-y divide-border">{orders.data.map(order => <li key={order.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-medium">{order.numero}</span><span className="text-muted-foreground">{order.status.replace(/_/g, " ")}</span><time className="text-sm text-muted-foreground" dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString("pt-BR")}</time></li>)}</ul>}
  </section>;
}