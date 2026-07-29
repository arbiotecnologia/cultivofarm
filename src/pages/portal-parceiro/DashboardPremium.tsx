import { useOutletContext, Link } from "react-router-dom";
import { usePartnerDashboardPremium } from "@/hooks/useCommercial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Truck, Clock, AlertCircle, Star, MessageSquare } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import { useAuth } from "@/hooks/useAuth";
import { getPrimeiroNome } from "@/components/portal-parceiro/UsuarioIdentidade";

export default function DashboardPremium() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { profile } = useAuth();
  const { data, isLoading } = usePartnerDashboardPremium(partner?.id);


  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!data) return null;

  const semPedidos =
    (data.em_andamento ?? 0) === 0 &&
    (data.entregues ?? 0) === 0 &&
    (data.aguardando_aprovacao ?? 0) === 0 &&
    (data.aguardando_ajuste ?? 0) === 0;

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Olá, {getPrimeiroNome(profile?.nome, profile?.email)}</h1>
        <p className="text-sm text-muted-foreground">
          {partner?.razao_social ?? "Parceiro"} · Gestor B2B
        </p>
      </div>


      {semPedidos && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <div className="text-sm text-muted-foreground">
              Você ainda não tem pedidos. Comece criando o primeiro pedido B2B.
            </div>
            <Button asChild size="sm">
              <Link to="/portal-parceiro/novo">
                <ShoppingCart className="h-4 w-4 mr-2" /> Criar novo pedido
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Truck className="h-4 w-4" />} label="Em andamento" value={data.em_andamento ?? 0} />
        <Kpi icon={<ShoppingCart className="h-4 w-4" />} label="Entregues" value={data.entregues ?? 0} />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Aguardando aprov." value={data.aguardando_aprovacao ?? 0} />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Em ajuste" value={data.aguardando_ajuste ?? 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4" /> Favoritos</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.favoritos_count ?? 0}</div>
            <Link to="/portal-parceiro/favoritos" className="text-sm text-primary hover:underline">Ver modelos</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Últimas mensagens</CardTitle></CardHeader>
          <CardContent>
            {(data.ultimas_mensagens ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem mensagens recentes.</div>
            ) : (
              <ul className="text-sm space-y-1">
                {data.ultimas_mensagens.map((m: any) => (
                  <li key={m.id} className="flex justify-between border-b py-1">
                    <span className="truncate max-w-[60%]">{m.mensagem}</span>
                    <Badge variant="outline" className="text-xs">{formatDateDisplay(m.created_at)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="font-bold text-2xl mt-1">{value}</div>
    </div>
  );
}
