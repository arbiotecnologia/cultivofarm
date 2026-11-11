import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SELLER_FISCAL_TEXT, useSellerPortfolio, useSellerPortfolioOrders, type SellerOrder } from "@/hooks/useSellerPortfolio";
import { ResponderCotacaoDialog } from "@/components/comercial/ResponderCotacaoDialog";
import { partnerOrderStatusLabel } from "@/lib/partnerOrderStatus";
import { brl } from "@/lib/financial/format";
import { CarteiraVendedoresAdmin } from "@/components/comercial/CarteiraVendedoresAdmin";

export default function MinhaCarteiraVendedor() {
  const { roles = [] } = useAuth() as any;
  const isAdmin = (roles as string[]).includes("administrador");
  if (isAdmin) return <div className="container mx-auto py-6"><CarteiraVendedoresAdmin /></div>;
  return <SellerPortfolioView />;
}

function SellerPortfolioView() {
  const { data, isLoading } = useSellerPortfolio();
  const orders = useSellerPortfolioOrders(!!data?.ready);
  const [quote, setQuote] = useState<SellerOrder | null>(null);

  if (isLoading) {
    return <div className="container mx-auto py-10 text-sm"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Carregando sua carteira…</div>;
  }
  if (!data?.installed || !data.ready) {
    return (
      <div className="container mx-auto py-10">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {data?.installed
              ? "Seu acesso de vendedor não está ativo nesta empresa. Fale com o administrador."
              : "A carteira de vendedor ainda não está disponível nesta empresa."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  const quotes = (orders.data ?? []).filter((o) => o.status === "aguardando_cotacao" && o.items.length > 0);
  const others = (orders.data ?? []).filter((o) => o.status !== "aguardando_cotacao");
  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Minha carteira</h1>
        <p className="text-sm text-muted-foreground">Parceiros atribuídos a você pelo administrador. Aprovação, cobrança, estoque e fiscal ficam com as áreas responsáveis.</p>
      </div>
      {data.fiscalBlock && (
        <Alert data-reason={data.fiscalBlock}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{SELLER_FISCAL_TEXT[data.fiscalBlock]}</AlertDescription>
        </Alert>
      )}
      {!data.fiscalBlock && !data.orderCreate && !data.quoteRespond && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Lançar pedidos e responder cotações ainda não estão liberados para a sua carteira.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Parceiros</CardTitle>
          <CardDescription>{data.partners.length} parceiro(s) na sua carteira.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum parceiro atribuído a você.</p>
          ) : (
            <ul className="divide-y">
              {data.partners.map((p) => (
                <li key={p.partner_id} className="py-2 flex items-center justify-between gap-2">
                  <span>{p.razao_social}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Carteira própria</Badge>
                    {p.orderCreate && (
                      <Button asChild size="sm">
                        <Link to={`/comercial/minha-carteira/pedido?parceiro=${encodeURIComponent(p.partner_id)}`}>Lançar pedido</Link>
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cotações pendentes</CardTitle>
          <CardDescription>Pedidos sob consulta dos parceiros da sua carteira.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.isLoading ? <p className="text-sm">Carregando…</p>
            : orders.data === null ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar os pedidos da carteira.</p>
            : quotes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma cotação pendente.</p>
            : <ul className="divide-y">
                {quotes.map((o) => (
                  <li key={o.id} className="py-2 flex items-center justify-between gap-2">
                    <span>{o.numero ?? "Pedido"} · {o.razao_social} · {o.items.length} item(ns)</span>
                    {data.quoteRespond && <Button size="sm" variant="outline" onClick={() => setQuote(o)}>Responder cotação</Button>}
                  </li>
                ))}
              </ul>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pedidos da carteira</CardTitle>
        </CardHeader>
        <CardContent>
          {others.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido.</p>
            : <ul className="divide-y">
                {others.map((o) => (
                  <li key={o.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                    <span>{o.numero ?? "Pedido"} · {o.razao_social}{o.created_by_me ? " · lançado por você" : ""}</span>
                    <span>{partnerOrderStatusLabel(o.status)}{o.total != null ? ` · ${brl(Number(o.total))}` : ""}</span>
                  </li>
                ))}
              </ul>}
        </CardContent>
      </Card>
      <ResponderCotacaoDialog
        open={!!quote}
        onOpenChange={(v) => { if (!v) setQuote(null); }}
        orderId={quote?.id ?? null}
        orderNumero={quote?.numero ?? null}
        items={quote?.items ?? []}
        onResponded={() => orders.refetch()}
      />
    </div>
  );
}
