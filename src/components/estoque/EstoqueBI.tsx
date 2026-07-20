import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, CheckCircle2, AlertCircle, Inbox, Truck, PackageCheck } from "lucide-react";

export function EstoqueBI() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["estoque-bi-stats"],
    queryFn: async () => {
      // 1. Lotes Envasados (Total de registros na tabela envase)
      const { count: envasadosCount } = await supabase
        .from("envase")
        .select("*", { count: 'exact', head: true });

      // 2. Disponíveis para Entrada 
      // (Lotes aprovados + com envase + sem registro principal no estoque_produto)
      const { data: lotesAprovados } = await supabase
        .from("lotes")
        .select("id")
        .eq("status", "aprovado");
      
      const aprovadosIds = (lotesAprovados || []).map(l => l.id);
      
      let disponiveisEntrada = 0;
      let pendentesBloqueio = 0;

      if (aprovadosIds.length > 0) {
        const [{ data: envases }, { data: estoquesExist }] = await Promise.all([
          supabase.from("envase").select("lote_id").in("lote_id", aprovadosIds),
          supabase.from("estoque_produto").select("lote_id").in("lote_id", aprovadosIds).is("quantidade_reservada", null)
        ]);

        const comEnvase = new Set((envases || []).map(e => e.lote_id));
        const jaNoEstoque = new Set((estoquesExist || []).map(e => e.lote_id));

        disponiveisEntrada = aprovadosIds.filter(id => comEnvase.has(id) && !jaNoEstoque.has(id)).length;
        
        // 3. Pendentes por Bloqueio 
        // (Lotes aprovados que NÃO têm envase ainda, logo não podem entrar no estoque)
        pendentesBloqueio = aprovadosIds.filter(id => !comEnvase.has(id)).length;
      }

      // 4. Total em Estoque (Registros ativos no estoque_produto)
      const { count: totalEstoque } = await supabase
        .from("estoque_produto")
        .select("*", { count: 'exact', head: true });

      // 5. Expedidos (itens já liberados para entrega)
      const { count: expedidosCount } = await supabase
        .from("estoque_produto")
        .select("*", { count: 'exact', head: true })
        .eq("status", "expedido");

      // 6. Entregues (consumidos pelo cliente — via movimentações)
      const { count: entreguesCount } = await supabase
        .from("estoque_movimentacoes")
        .select("*", { count: 'exact', head: true })
        .eq("acao", "entregue");

      return {
        envasados: envasadosCount || 0,
        disponiveis: disponiveisEntrada,
        pendentes: pendentesBloqueio,
        totalEstoque: totalEstoque || 0,
        expedidos: expedidosCount || 0,
        entregues: entreguesCount || 0,
      };
    },
    refetchInterval: 300000 // Atualiza a cada 30s
  });

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-pulse">
    {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-muted rounded-xl" />)}
  </div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card className="bg-blue-50/50 border-blue-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-blue-700">Lotes Envasados</CardTitle>
          <Inbox className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-900">{stats?.envasados}</div>
          <p className="text-xs text-blue-600 mt-1">Total produzido e envasado</p>
        </CardContent>
      </Card>

      <Card className="bg-green-50/50 border-green-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-green-700">Disp. p/ Entrada</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-900">{stats?.disponiveis}</div>
          <p className="text-xs text-green-600 mt-1">Aguardando lançamento manual</p>
        </CardContent>
      </Card>

      <Card className="bg-amber-50/50 border-amber-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-amber-700">Pend. Bloqueio</CardTitle>
          <AlertCircle className="h-4 w-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-900">{stats?.pendentes}</div>
          <p className="text-xs text-amber-600 mt-1">Aprovados sem envase</p>
        </CardContent>
      </Card>

      <Card className="bg-purple-50/50 border-purple-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-purple-700">Itens em Estoque</CardTitle>
          <Package className="h-4 w-4 text-purple-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-900">{stats?.totalEstoque}</div>
          <p className="text-xs text-purple-600 mt-1">Registros atuais no sistema</p>
        </CardContent>
      </Card>

      <Card className="bg-orange-50/50 border-orange-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-orange-700">Expedidos</CardTitle>
          <Truck className="h-4 w-4 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-900">{stats?.expedidos}</div>
          <p className="text-xs text-orange-600 mt-1">Liberados para entrega</p>
        </CardContent>
      </Card>

      <Card className="bg-emerald-50/50 border-emerald-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-emerald-700">Entregues</CardTitle>
          <PackageCheck className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-900">{stats?.entregues}</div>
          <p className="text-xs text-emerald-600 mt-1">Consumidos pelo cliente</p>
        </CardContent>
      </Card>
    </div>
  );
}
