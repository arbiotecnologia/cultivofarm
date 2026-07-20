import { useState } from "react";
import { useProductionDashboard, useB2BCapacityKpis, useB2BIntegrityCheck } from "@/hooks/useProductionPlanning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Factory, Clock, CheckCircle2, Truck, Package, Droplets, AlertTriangle, ShieldCheck } from "lucide-react";
import { brl as fmtBRL } from "@/lib/financial/format";

const fmtL = (v?: number | null) => `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`;

export default function DashboardProducao() {
  const { data, isLoading } = useProductionDashboard();
  const { data: cap } = useB2BCapacityKpis();
  const [checkIntegrity, setCheckIntegrity] = useState(false);
  const { data: integrity, isFetching: checking } = useB2BIntegrityCheck(checkIntegrity);

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const statusCards = [
    { label: "Aguardando planejamento", value: data.aguardando, icon: Clock },
    { label: "Planejado", value: data.planejado, icon: Factory },
    { label: "Em produção", value: data.emProducao, icon: Factory },
    { label: "Produzido", value: data.produzido, icon: CheckCircle2 },
    { label: "Entregue", value: data.entregue, icon: Truck },
    { label: "Total pedidos", value: data.total, icon: Package },
  ];

  const capCards = cap
    ? [
        { label: "Litros programados", value: fmtL(cap.litros_programados), icon: Droplets },
        { label: "Litros em produção", value: fmtL(cap.litros_em_producao), icon: Droplets },
        { label: "Litros produzidos", value: fmtL(cap.litros_produzidos), icon: Droplets },
        { label: "Litros entregues", value: fmtL(cap.litros_entregues), icon: Truck },
        { label: "Produção (semana)", value: fmtL(cap.producao_semana), icon: Factory },
        { label: "Produção (mês)", value: fmtL(cap.producao_mes), icon: Factory },
      ]
    : [];

  const integrityIssues = integrity
    ? Object.entries(integrity).filter(([, v]) => Number(v) > 0)
    : [];

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Factory className="h-6 w-6" /> Dashboard Produção B2B
        </h1>
        <p className="text-sm text-muted-foreground">Indicadores operacionais e capacidade produtiva dos pedidos B2B</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Status dos pedidos</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {statusCards.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs text-muted-foreground font-medium">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {capCards.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Capacidade produtiva</h2>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {capCards.map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs text-muted-foreground font-medium">{label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xl font-bold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Volume financeiro programado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmtBRL(data.valorTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">Somatório dos pedidos B2B na fila de produção</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Integridade operacional
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setCheckIntegrity(true)} disabled={checking}>
              {checking ? "Verificando…" : "Validar agora"}
            </Button>
          </CardHeader>
          <CardContent>
            {!checkIntegrity && (
              <p className="text-xs text-muted-foreground">Execute a validação para verificar vínculos órfãos.</p>
            )}
            {checkIntegrity && integrity && integrityIssues.length === 0 && (
              <p className="text-sm flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Nenhuma inconsistência detectada.
              </p>
            )}
            {integrityIssues.length > 0 && (
              <ul className="space-y-1 text-sm">
                {integrityIssues.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between border-l-2 border-destructive pl-2">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                    <Badge variant="destructive" className="ml-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {v}
                    </Badge>
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
