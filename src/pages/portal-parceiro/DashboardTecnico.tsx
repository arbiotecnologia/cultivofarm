import { useOutletContext, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlaskConical, FileText, Beaker, Package, Info, History, Users } from "lucide-react";
import { usePartnerCatalogTecnico } from "@/hooks/usePartnerCatalogTecnico";
import { usePartnerSimulations } from "@/hooks/usePartnerSimulations";
import { formatDateDisplay } from "@/lib/date-utils";
import { useAuth } from "@/hooks/useAuth";
import { getPrimeiroNome } from "@/components/portal-parceiro/UsuarioIdentidade";

export default function DashboardTecnico() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { profile } = useAuth();
  const { data: catalog = [], isLoading: loadingCat } = usePartnerCatalogTecnico();
  const { data: sims = [], isLoading: loadingSims } = usePartnerSimulations(partner?.id);

  const { data: produtores = [] } = useQuery({
    queryKey: ["b2b-user-clientes-dash"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_b2b_user_clients_secure" as any, {
        p_user_id: null,
        p_search: null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const produtos = catalog.filter((c: any) => c.item_tipo === "produto").length;
  const micros = catalog.filter((c: any) => c.item_tipo === "microrganismo").length;
  const ultima = sims[0];
  const enviadas = sims.filter((s: any) => s.status === "enviada_gestor").length;
  const convertidas = sims.filter((s: any) => s.status === "convertida_pedido").length;

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Olá, {getPrimeiroNome(profile?.nome, profile?.email)}</h1>
        <p className="text-sm text-muted-foreground">
          {partner?.razao_social ?? "Parceiro"} · Portal Técnico B2B
        </p>
      </div>


      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Valores exibidos são valores de tabela, sem desconto. Condições comerciais finais são
          aplicadas pelo gestor B2B.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Users className="h-4 w-4" />} label="Meus produtores" value={produtores.length} />
        <Kpi icon={<Package className="h-4 w-4" />} label="Produtos B2B" value={loadingCat ? "…" : produtos} />
        <Kpi icon={<Beaker className="h-4 w-4" />} label="Microrganismos B2B" value={loadingCat ? "…" : micros} />
        <Kpi icon={<FlaskConical className="h-4 w-4" />} label="Simulações" value={loadingSims ? "…" : sims.length} />
        <Kpi icon={<History className="h-4 w-4" />} label="Enviadas ao gestor" value={enviadas} />
        <Kpi icon={<History className="h-4 w-4" />} label="Convertidas" value={convertidas} />
        <Kpi icon={<History className="h-4 w-4" />} label="Última simulação" value={ultima ? formatDateDisplay(ultima.created_at) : "—"} />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Meus produtores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Produtores vinculados que você pode atender.</p>
            <Button asChild size="sm">
              <Link to="/portal-parceiro/meus-produtores">Abrir lista</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4" /> Nova simulação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Monte uma recomendação com produtos e microrganismos disponíveis para B2B.
            </p>
            <Button asChild size="sm">
              <Link to="/portal-parceiro/simulador">Abrir simulador</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Fichas técnicas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Consulte as fichas liberadas para uso comercial B2B.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/portal-parceiro/fichas">Ver fichas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {ultima && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Última simulação</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="font-medium">{ultima.titulo ?? "Simulação"}</div>
            <div className="text-muted-foreground">
              {ultima.items_count ?? 0} itens
            </div>
            <Button asChild size="sm" variant="link" className="px-0">
              <Link to="/portal-parceiro/simulacoes">Ver histórico</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="font-bold text-2xl mt-1">{value}</div>
    </div>
  );
}
