import { useState } from "react";
import { useProductionDashboard, useB2BCapacityKpis, useB2BIntegrityCheck } from "@/hooks/useProductionPlanning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Factory, Clock, CheckCircle2, Truck, Package, Droplets, AlertTriangle, ShieldCheck, RefreshCw, XCircle, RotateCcw } from "lucide-react";
import {
  STATUS_LABEL,
  formatBRLouTraco,
  formatInteiro,
  formatLitros,
  listarInconsistencias,
  mensagemErro,
} from "@/lib/dashboard-producao/producao";

export default function DashboardProducao() {
  const { data, isLoading, isError, error, refetch, isFetching } = useProductionDashboard();
  const { data: cap, isError: capErro, error: capError, refetch: refetchCap, isFetching: capFetching } = useB2BCapacityKpis();
  const [checkIntegrity, setCheckIntegrity] = useState(false);
  const {
    data: integrity,
    isFetching: checking,
    isError: integrityErro,
    error: integrityError,
    refetch: refetchIntegrity,
  } = useB2BIntegrityCheck(checkIntegrity);

  const statusCards = data
    ? [
        { label: STATUS_LABEL.aguardando_planejamento, value: data.porStatus.aguardando_planejamento, icon: Clock },
        { label: STATUS_LABEL.planejado, value: data.porStatus.planejado, icon: Factory },
        { label: STATUS_LABEL.em_producao, value: data.porStatus.em_producao, icon: Factory },
        { label: STATUS_LABEL.produzido, value: data.porStatus.produzido, icon: CheckCircle2 },
        { label: STATUS_LABEL.entregue, value: data.porStatus.entregue, icon: Truck },
        { label: STATUS_LABEL.replanejar, value: data.porStatus.replanejar, icon: RotateCcw },
        { label: STATUS_LABEL.cancelado, value: data.porStatus.cancelado, icon: XCircle },
        { label: "Total de pedidos", value: data.total, icon: Package },
      ]
    : [];

  const capCards = cap
    ? [
        { label: "Litros programados", value: formatLitros(cap.litros_programados), icon: Droplets },
        { label: "Litros em produção", value: formatLitros(cap.litros_em_producao), icon: Droplets },
        { label: "Litros produzidos", value: formatLitros(cap.litros_produzidos), icon: Droplets },
        { label: "Litros entregues", value: formatLitros(cap.litros_entregues), icon: Truck },
        { label: "Produção (semana)", value: formatLitros(cap.producao_semana), icon: Factory },
        { label: "Produção (mês)", value: formatLitros(cap.producao_mes), icon: Factory },
      ]
    : [];

  const inconsistencias = listarInconsistencias(integrity);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6" aria-hidden="true" /> Dashboard Produção B2B
          </h1>
          <p className="text-sm text-muted-foreground">Indicadores operacionais e capacidade produtiva dos pedidos B2B</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void refetch();
            void refetchCap();
            if (checkIntegrity) void refetchIntegrity();
          }}
          disabled={isFetching || capFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching || capFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Atualizar
        </Button>
      </div>

      <section aria-labelledby="status-pedidos">
        <h2 id="status-pedidos" className="text-sm font-semibold text-muted-foreground mb-2">
          Status dos pedidos
        </h2>

        {isLoading && (
          <p className="text-sm text-muted-foreground" role="status">
            Carregando indicadores…
          </p>
        )}

        {isError && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-destructive" role="alert">
                {mensagemErro(error, "Não foi possível carregar os indicadores de produção.")}
              </p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && data && data.total === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum pedido B2B em planejamento de produção.</p>
        )}

        {!isError && data && data.total > 0 && (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              {statusCards.map(({ label, value, icon: Icon }) => (
                <Card key={label}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-xs text-muted-foreground font-medium">{label}</CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="text-2xl font-bold">{formatInteiro(value)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {data.outros > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {formatInteiro(data.outros)} pedido(s) com status fora da lista acima — não somados aos demais cartões.
              </p>
            )}
          </>
        )}
      </section>

      {capErro && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm text-destructive" role="alert">
              {mensagemErro(capError, "Não foi possível carregar a capacidade produtiva.")}
            </p>
            <Button size="sm" variant="outline" onClick={() => void refetchCap()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {capCards.length > 0 && (
        <section aria-labelledby="capacidade-produtiva">
          <h2 id="capacidade-produtiva" className="text-sm font-semibold text-muted-foreground mb-2">
            Capacidade produtiva
          </h2>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {capCards.map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium">{label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xl font-bold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Volumes calculados a partir do volume das ordens de serviço B2B (mililitros convertidos em litros). Itens sem
            volume registrado não entram nestes totais. Semana e mês seguem o calendário do servidor.
          </p>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Volume financeiro programado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data ? formatBRLouTraco(data.valorAtivos) : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Somatório dos pedidos B2B na fila de produção, sem duplicidade e excluindo cancelados.
            </p>
            {data && data.pedidosSemValor > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatInteiro(data.pedidosSemValor)} pedido(s) sem valor informado não entram neste total.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Integridade operacional
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => (checkIntegrity ? void refetchIntegrity() : setCheckIntegrity(true))}
              disabled={checking}
            >
              {checking ? "Verificando…" : "Validar agora"}
            </Button>
          </CardHeader>
          <CardContent>
            {!checkIntegrity && (
              <p className="text-xs text-muted-foreground">Execute a validação para verificar vínculos órfãos.</p>
            )}
            {checkIntegrity && checking && (
              <p className="text-sm text-muted-foreground" role="status">
                Verificando vínculos…
              </p>
            )}
            {checkIntegrity && !checking && integrityErro && (
              <div className="space-y-2">
                <p className="text-sm text-destructive" role="alert">
                  {mensagemErro(integrityError, "Não foi possível concluir a validação.")}
                </p>
                <Button size="sm" variant="outline" onClick={() => void refetchIntegrity()}>
                  Tentar novamente
                </Button>
              </div>
            )}
            {checkIntegrity && !checking && !integrityErro && integrity && inconsistencias.length === 0 && (
              <p className="text-sm flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Nenhuma inconsistência detectada.
              </p>
            )}
            {!checking && !integrityErro && inconsistencias.length > 0 && (
              <ul className="space-y-1 text-sm">
                {inconsistencias.map(({ chave, rotulo, quantidade }) => (
                  <li key={chave} className="flex items-center justify-between gap-2 border-l-2 border-destructive pl-2">
                    <span className="text-muted-foreground">{rotulo}</span>
                    <Badge variant="destructive" className="ml-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {formatInteiro(quantidade)}
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
