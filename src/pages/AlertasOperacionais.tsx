import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  useAlertasOperacionais,
  type AlertaOperacional,
} from "@/hooks/useAlertasOperacionais";
import { AlertasHeader } from "@/components/alertas/AlertasHeader";
import { AlertasResumoCards } from "@/components/alertas/AlertasResumoCards";
import { AlertasFiltros } from "@/components/alertas/AlertasFiltros";
import { AlertasLista } from "@/components/alertas/AlertasLista";
import { AlertasErrorState } from "@/components/alertas/AlertasErrorState";
import { AlertaDetalheDrawer } from "@/components/alertas/AlertaDetalheDrawer";
import { AlertasPainelPrioridades } from "@/components/alertas/AlertasPainelPrioridades";
import { AlertasExecucaoStatus } from "@/components/alertas/AlertasExecucaoStatus";
import { AlertasExecucoesHistorico } from "@/components/alertas/AlertasExecucoesHistorico";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MailCheck, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAlertasNotificacoes } from "@/hooks/useAlertasNotificacoes";
import { AlertasNotificacaoConfig } from "@/components/alertas/config/AlertasNotificacaoConfig";
import { AlertasDestinatariosConfig } from "@/components/alertas/config/AlertasDestinatariosConfig";
import { AlertasNotificacoesHistorico } from "@/components/alertas/config/AlertasNotificacoesHistorico";
import { AlertasSLAPainel } from "@/components/alertas/sla/AlertasSLAPainel";
import { AlertasSLAConfig } from "@/components/alertas/sla/AlertasSLAConfig";
import { AlertasSLAHistorico } from "@/components/alertas/sla/AlertasSLAHistorico";
import { AlertasResumoConfig } from "@/components/alertas/config/AlertasResumoConfig";
import { AlertasResumosHistorico } from "@/components/alertas/config/AlertasResumosHistorico";

export default function AlertasOperacionais() {
  const {
    loading,
    gerando,
    error,
    alertas,
    alertasBrutos,
    lidoIds,
    filtros,
    setFiltros,
    podeGerar,
    totalAbertos,
    totalNaoLidos,
    totalCriticos,
    totalAlta,
    totalResolvidos,
    totalGeradosHoje,
    marcarComoLido,
    registrarLeitura,
    marcarTodosComoLidos,
    resolverAlerta,
    ignorarAlerta,
    reabrirAlerta,
    gerarAlertas,
    atualizarAlertas,
    realtimeConnected,
    realtimeEnabled,
  } = useAlertasOperacionais();

  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<AlertaOperacional | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Suporte a deep-link ?alerta=<id>
  useEffect(() => {
    const id = searchParams.get("alerta");
    if (!id || drawerOpen) return;
    const fonte = alertasBrutos ?? alertas;
    const found = fonte.find((a) => a.id === id);
    if (found) {
      setSelected(found);
      setDrawerOpen(true);
    }
  }, [searchParams, alertas, alertasBrutos, drawerOpen]);

  // Detecta atualização do alerta aberto no drawer pela onda de Realtime.
  useEffect(() => {
    if (!drawerOpen || !selected) return;
    const fonte = alertasBrutos ?? alertas;
    const atualizado = fonte.find((a) => a.id === selected.id);
    if (atualizado && atualizado.updated_at !== selected.updated_at) {
      toast.info("Este alerta foi atualizado.");
      setSelected(atualizado);
    }
  }, [alertasBrutos, alertas, drawerOpen, selected]);


  const openAlerta = (a: AlertaOperacional) => {
    setSelected(a);
    setDrawerOpen(true);
  };

  const openPorId = (id: string) => {
    const fonte = alertasBrutos ?? alertas;
    const found = fonte.find((a) => a.id === id);
    if (found) {
      openAlerta(found);
    } else {
      // alerta pode não estar na lista filtrada — empurra para query
      setSearchParams((p) => {
        p.set("alerta", id);
        return p;
      });
    }
  };

  const handleDrawerChange = (o: boolean) => {
    setDrawerOpen(o);
    if (!o && searchParams.get("alerta")) {
      setSearchParams((p) => {
        p.delete("alerta");
        return p;
      });
    }
  };

  const handleGerar = async () => {
    try {
      const res = await gerarAlertas();
      const proc = res?.total_processados ?? 0;
      const resolvidos = res?.total_resolvidos_automaticamente ?? 0;
      toast.success(
        `Alertas atualizados: ${proc} processados, ${resolvidos} resolvidos automaticamente.`
      );
    } catch {
      toast.error("Não foi possível atualizar os alertas agora.");
    }
  };

  const handleMarcarTodos = async () => {
    try {
      const n = await marcarTodosComoLidos();
      if (n > 0) toast.success(`${n} alerta(s) marcado(s) como lido(s).`);
      else toast.info("Nenhum alerta para marcar como lido.");
    } catch {
      toast.error("Não foi possível marcar os alertas como lidos.");
    }
  };

  const notif = useAlertasNotificacoes();
  const verAbaConfig = notif.podeVer;


  const handleProcessarNotif = async () => {
    try {
      const res = await notif.processarNotificacoesManual();
      toast.success(
        `Notificações preparadas: ${res?.total_notificacoes_criadas ?? 0} criadas, ${res?.total_ignoradas_cooldown ?? 0} em cooldown, ${res?.total_bloqueadas_limite ?? 0} bloqueadas.`,
      );
    } catch {
      toast.error("Não foi possível processar as notificações.");
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-5">
      <AlertasHeader
        onRefresh={atualizarAlertas}
        loading={loading}
        podeGerar={podeGerar}
        onGerar={handleGerar}
        gerando={gerando}
        realtimeConnected={realtimeConnected}
        realtimeEnabled={realtimeEnabled}
      />

      <Tabs defaultValue="central" className="w-full">
        <TabsList>
          <TabsTrigger value="central">Central</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          {verAbaConfig && <TabsTrigger value="config">Configurações</TabsTrigger>}
        </TabsList>

        <TabsContent value="central" className="space-y-5 mt-4">
          <AlertasSLAPainel />
          <AlertasExecucaoStatus />
          <AlertasPainelPrioridades onSelect={openPorId} />
          <AlertasResumoCards
            totalAbertos={totalAbertos}
            totalNaoLidos={totalNaoLidos}
            totalCriticos={totalCriticos}
            totalAlta={totalAlta}
            totalResolvidos={totalResolvidos}
            totalGeradosHoje={totalGeradosHoje}
          />

          <Card>
            <CardContent className="p-4 space-y-3">
              <AlertasFiltros filtros={filtros} setFiltros={setFiltros} />
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarcarTodos}
                  disabled={totalNaoLidos === 0}
                >
                  <MailCheck className="h-4 w-4 mr-2" />
                  Marcar todos como lidos
                </Button>
              </div>
            </CardContent>
          </Card>

          <AlertasExecucoesHistorico />

          {error ? (
            <AlertasErrorState message={error} onRetry={atualizarAlertas} />
          ) : loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <AlertasLista alertas={alertas} onOpen={openAlerta} lidoIds={lidoIds} />
          )}
        </TabsContent>

        <TabsContent value="sla" className="space-y-5 mt-4">
          <AlertasSLAPainel />
          <AlertasSLAConfig />
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-base font-semibold">Histórico de eventos SLA</h3>
              <AlertasSLAHistorico />
            </CardContent>
          </Card>
        </TabsContent>



        {verAbaConfig && (
          <TabsContent value="config" className="space-y-5 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold">Notificações externas</h2>
                <p className="text-sm text-muted-foreground">
                  E-mail para alertas críticos e de alta prioridade. WhatsApp será ativado em fase futura.
                </p>
              </div>
              {notif.podeGerenciar && (
                <Button onClick={handleProcessarNotif} disabled={notif.processando}>
                  <Send className="h-4 w-4 mr-2" />
                  {notif.processando ? "Processando..." : "Processar notificações"}
                </Button>
              )}
            </div>

            <AlertasNotificacaoConfig
              configs={notif.configs}
              podeEditar={notif.podeGerenciar}
              onSalvar={notif.salvarConfig}
            />

            <AlertasDestinatariosConfig
              destinatarios={notif.destinatarios}
              podeEditar={notif.podeGerenciar}
              onSalvar={notif.salvarDestinatario}
              onAlternar={notif.alternarDestinatario}
              onRemover={notif.removerDestinatario}
            />

            <AlertasNotificacoesHistorico historico={notif.historico} />

            <div className="pt-2 border-t" />

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold">Resumos executivos</h2>
                <p className="text-sm text-muted-foreground">
                  Diário e semanal para gestores autorizados (e-mail).
                </p>
              </div>
              {notif.podeGerenciar && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const r = await notif.processarResumoManual("diario");
                        toast.success(
                          `Resumo diário: ${r?.total_resumos_criados ?? 0} criado(s), ${r?.total_ignorados_duplicidade ?? 0} ignorado(s) por duplicidade.`,
                        );
                      } catch {
                        toast.error("Não foi possível gerar o resumo diário.");
                      }
                    }}
                    disabled={notif.processandoResumo}
                  >
                    Gerar resumo diário
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const r = await notif.processarResumoManual("semanal");
                        toast.success(
                          `Resumo semanal: ${r?.total_resumos_criados ?? 0} criado(s), ${r?.total_ignorados_duplicidade ?? 0} ignorado(s) por duplicidade.`,
                        );
                      } catch {
                        toast.error("Não foi possível gerar o resumo semanal.");
                      }
                    }}
                    disabled={notif.processandoResumo}
                  >
                    Gerar resumo semanal
                  </Button>
                </div>
              )}
            </div>

            <AlertasResumoConfig
              config={notif.resumoConfig}
              podeEditar={notif.podeGerenciar}
              onSalvar={notif.salvarResumoConfig}
            />

            <AlertasResumosHistorico historico={notif.historicoResumos} />
          </TabsContent>
        )}
      </Tabs>



      <AlertaDetalheDrawer
        alerta={selected}
        open={drawerOpen}
        onOpenChange={handleDrawerChange}
        onMarcarLido={marcarComoLido}
        onResolver={resolverAlerta}
        onIgnorar={ignorarAlerta}
        onReabrir={reabrirAlerta}
        onLeituraAutomatica={registrarLeitura}
      />

      <p className="text-xs text-muted-foreground text-center pt-4">
        Os alertas são exibidos conforme suas permissões. Ações de campo e fluxos operacionais não são alterados por esta central.
      </p>
    </div>
  );
}
