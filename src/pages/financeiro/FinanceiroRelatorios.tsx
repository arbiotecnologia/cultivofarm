import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, FileBarChart2, FileSpreadsheet, Receipt, AlertTriangle, FileText,
  Users, TrendingUp, ClipboardList, Tractor, Building2,
} from "lucide-react";
import { HistoricoExportacoes } from "@/components/financeiro/relatorios/HistoricoExportacoes";

const groups = [
  {
    title: "Gestão Financeira",
    items: [
      { to: "/financeiro/relatorios/mensal", title: "Relatório Mensal", desc: "Receitas, despesas, saldo do período", icon: BarChart3 },
      { to: "/financeiro/fluxo-caixa", title: "Fluxo de Caixa", desc: "Previsto x realizado", icon: TrendingUp },
      { to: "/financeiro/dre", title: "DRE Gerencial", desc: "Resultado por competência/caixa", icon: FileBarChart2 },
      { to: "/financeiro/relatorios/contas-receber", title: "Contas a Receber", desc: "Detalhado de títulos", icon: ClipboardList },
      { to: "/financeiro/relatorios/contas-pagar", title: "Contas a Pagar", desc: "Detalhado de títulos", icon: ClipboardList },
    ],
  },
  {
    title: "Cobrança e Fiscal",
    items: [
      { to: "/financeiro/relatorios/inadimplencia", title: "Inadimplência", desc: "Títulos em atraso", icon: AlertTriangle },
      { to: "/financeiro/relatorios/nfe-pendente", title: "NF-e Pendente", desc: "Notas a emitir / obrigatórias", icon: FileSpreadsheet },
      { to: "/financeiro/relatorios/por-cliente", title: "Extrato por Cliente", desc: "Entregue, faturado, recebido", icon: Users },
      { to: "/financeiro/recibos", title: "Recibos Emitidos", desc: "Gestão e cancelamento", icon: Receipt },
    ],
  },
  {
    title: "Operacional",
    items: [
      { to: "/financeiro/relatorios/entregas-faturamento", title: "Entregas x Faturamento", desc: "Faturadas vs não faturadas", icon: Tractor },
      { to: "/financeiro/relatorios/prestacao-contas", title: "Prestação de Contas — Cliente", desc: "Consolidado por cliente/produtor", icon: FileText },
      { to: "/financeiro/relatorios/prestacao-contas?escopo=fazenda", title: "Prestação de Contas — Fazenda/Contrato", desc: "Consolidado por fazenda ou contrato", icon: Building2 },
    ],
  },
];

export default function FinanceiroRelatorios() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central de Relatórios Financeiros</h1>
        <p className="text-sm text-muted-foreground">Gere, exporte e audite relatórios financeiros da Cultivo Farm.</p>
      </div>

      <Tabs defaultValue="relatorios" className="space-y-4">
        <TabsList>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Exportações</TabsTrigger>
        </TabsList>

        <TabsContent value="relatorios" className="space-y-6">
          {groups.map((g) => (
            <div key={g.title} className="space-y-3">
              <h2 className="text-lg font-semibold">{g.title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Link key={it.to + it.title} to={it.to}>
                      <Card className="hover:border-primary transition-colors h-full">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-5 h-5 text-primary" />
                            <CardTitle className="text-base">{it.title}</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription>{it.desc}</CardDescription>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="historico">
          <HistoricoExportacoes />
        </TabsContent>
      </Tabs>
    </div>
  );
}
