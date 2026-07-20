import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardClimatico } from "@/components/previsao/DashboardClimatico";
import { CalculoRisco } from "@/components/previsao/CalculoRisco";
import { PainelAlertas } from "@/components/previsao/PainelAlertas";
import { HistoricoAlertas } from "@/components/previsao/HistoricoAlertas";
import { PrevisaoInteligente } from "@/components/previsao/PrevisaoInteligente";
import { CloudSun } from "lucide-react";

export default function PrevisaoAgronomica() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CloudSun className="h-6 w-6" /> Previsão Agronômica e Monitoramento Climático
        </h1>
        <p className="text-muted-foreground">Integre dados climáticos com histórico agronômico para antecipar problemas.</p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="dashboard">Dashboard Climático</TabsTrigger>
          <TabsTrigger value="risco">Cálculo de Risco</TabsTrigger>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="previsao">Previsão Inteligente</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><DashboardClimatico /></TabsContent>
        <TabsContent value="risco"><CalculoRisco /></TabsContent>
        <TabsContent value="alertas"><PainelAlertas /></TabsContent>
        <TabsContent value="historico"><HistoricoAlertas /></TabsContent>
        <TabsContent value="previsao"><PrevisaoInteligente /></TabsContent>
      </Tabs>
    </div>
  );
}
