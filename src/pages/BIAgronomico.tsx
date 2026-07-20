import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardAgronomico } from "@/components/bi/DashboardAgronomico";
import { IndicadoresManejo } from "@/components/bi/IndicadoresManejo";
import { EficienciaBioinsumos } from "@/components/bi/EficienciaBioinsumos";
import { EficienciaProducao } from "@/components/bi/EficienciaProducao";
import { DashboardCustos } from "@/components/bi/DashboardCustos";
import { ComparacaoTalhoes } from "@/components/bi/ComparacaoTalhoes";
import { MonitoramentoProblemas } from "@/components/bi/MonitoramentoProblemas";
import { HistoricoIntervencoes } from "@/components/bi/HistoricoIntervencoes";
import { InteligenciaRecomendacao } from "@/components/bi/InteligenciaRecomendacao";



export default function BIAgronomico() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">BI Agronômico e Inteligência de Manejo</h1>
        <p className="text-muted-foreground">Análises estratégicas baseadas nos dados operacionais do sistema</p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <div className="w-full overflow-x-auto pb-1 no-scrollbar">
          <TabsList className="w-max sm:w-auto flex min-w-full">
            <TabsTrigger value="dashboard" className="flex-1">Manejo</TabsTrigger>
            <TabsTrigger value="indicadores" className="flex-1">Indicadores</TabsTrigger>
            <TabsTrigger value="producao" className="flex-1">Produção</TabsTrigger>
            <TabsTrigger value="custos" className="flex-1">Custos</TabsTrigger>
            <TabsTrigger value="talhoes" className="flex-1">Talhões</TabsTrigger>
            <TabsTrigger value="problemas" className="flex-1">Problemas</TabsTrigger>
            <TabsTrigger value="inteligencia" className="flex-1">Inteligência</TabsTrigger>

          </TabsList>
        </div>

        <TabsContent value="dashboard"><DashboardAgronomico /></TabsContent>
        <TabsContent value="indicadores"><IndicadoresManejo /></TabsContent>
        <TabsContent value="producao"><EficienciaProducao /></TabsContent>
        <TabsContent value="custos"><DashboardCustos /></TabsContent>
        <TabsContent value="talhoes"><ComparacaoTalhoes /></TabsContent>
        <TabsContent value="problemas"><MonitoramentoProblemas /></TabsContent>
        <TabsContent value="inteligencia"><InteligenciaRecomendacao /></TabsContent>

      </Tabs>
    </div>
  );
}
