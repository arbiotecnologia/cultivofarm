import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, AlertTriangle, ArrowRight, DollarSign, FlaskConical,
  Package, Truck, Users, ShieldCheck, Warehouse, Layers, RefreshCw,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { useExecutivoResumo } from "@/hooks/useExecutivoResumo";

/**
 * Fase 3 — Visão Geral do Dashboard unificado.
 *
 * Composição enxuta (regra 8: NÃO carregar consultas completas das visões
 * Executiva/Operacional). Reutiliza `useExecutivoResumo` (mesma cache key
 * usada na Visão Executiva → dedupe automático quando o usuário troca de
 * aba). Consultas específicas do laboratório usam agregações leves.
 */
export default function VisaoGeral() {
  const resumoQ = useExecutivoResumo({ periodo: "30_dias" });

  // Situação resumida do laboratório (regra 13) — agregação server-side
  // (rpc_dashboard_geral_lab_resumo), sem baixar linhas para o cliente.
  const labQ = useQuery({
    queryKey: ["dashboard-geral-lab-resumo"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_dashboard_geral_lab_resumo" as never);
      if (error) throw error;
      const payload = data as {
        resumo?: Record<string, number>;
        dados_indisponiveis?: string[];
      } | null;
      const resumo = payload?.resumo ?? {};
      const indisponiveis = new Set(payload?.dados_indisponiveis ?? []);
      return {
        os_aguardando: Number(resumo.os_aguardando ?? 0),
        lotes_producao: Number(resumo.lotes_producao ?? 0),
        cq_pendente: Number(resumo.cq_pendente ?? 0),
        envases_pendentes: Number(resumo.envases_pendentes ?? 0),
        insumos_criticos: Number(resumo.insumos_criticos ?? 0),
        entregas_pendentes: Number(resumo.entregas_pendentes ?? 0),
        indisponiveis,
      };
    },
    staleTime: 60_000,
    retry: false,
  });


  if (import.meta.env.DEV) {
    if (resumoQ.error) console.warn("[VisaoGeral] resumo executivo indisponível:", resumoQ.error);
    if (labQ.error) console.warn("[VisaoGeral] resumo laboratório indisponível:", labQ.error);
  }

  const resumo = resumoQ.data?.resumo;
  // Fonte indisponível ≠ zero real: a RPC lista as origens que falharam.
  const indisp = new Set<string>(
    ((resumoQ.data?.dados_indisponiveis ?? []) as unknown[]).map((d) =>
      typeof d === "string" ? d : String((d as { indicador?: string })?.indicador ?? ""),
    ),
  );
  const saude = resumoQ.data?.saude_operacional;
  const lab = labQ.data;
  const resumoErr = !!resumoQ.error;
  const labErr = !!labQ.error;
  const prioridadeIndisponivel = ["solicitacoes_criticas", "visitas_atrasadas"].some((item) => indisp.has(item));

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Visão Geral</h1>
          <p className="text-sm text-muted-foreground">
            Período: últimos 30 dias · Indicadores de posição atual marcados como “Agora”.
          </p>
        </div>
      </header>

      {/* Bloco A — Executivo (dependente da RPC rpc_executivo_resumo_geral).
          Em caso de erro: um único card consolidado com Tentar Novamente.
          Blocos B/C permanecem independentes e continuam disponíveis. */}
      {resumoErr ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Resumo executivo indisponível
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Não foi possível carregar o resumo executivo neste momento.
              Os demais módulos continuam disponíveis.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => resumoQ.refetch()}
              disabled={resumoQ.isFetching}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${resumoQ.isFetching ? "animate-spin" : ""}`} />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Saúde Operacional
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resumoQ.isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <div className="text-3xl font-bold">{saude?.score ?? "—"}</div>
                  <Badge variant="outline" className="mt-1 text-xs">{saude?.classificacao ?? "sem dados"}</Badge>
                </>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Agora</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Alertas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resumoQ.isLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-3xl font-bold">
                  {indisp.has("alertas_operacionais")
                    ? <span className="text-base font-medium text-muted-foreground">Indisponível</span>
                    : (resumo?.alertas_ativos ?? 0)}
                </div>
              )}
              <Link to="/alertas-operacionais" className="text-xs text-primary hover:underline">Ver alertas →</Link>
              <p className="text-[10px] text-muted-foreground">Agora</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Receita recebida
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resumoQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold">
                  {indisp.has("receita_recebida")
                    ? <span className="text-base font-medium text-muted-foreground">Indisponível</span>
                    : (resumo?.receita_recebida ?? resumo?.receita_bruta) != null
                    ? Number(resumo?.receita_recebida ?? resumo?.receita_bruta).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                    : "—"}
                </div>
              )}

              <Link to="/financeiro" className="text-xs text-primary hover:underline">Abrir financeiro →</Link>
              <p className="text-[10px] text-muted-foreground">Últimos 30 dias</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Clientes ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resumoQ.isLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-3xl font-bold">
                  {indisp.has("clientes_ativos")
                    ? <span className="text-base font-medium text-muted-foreground">Indisponível</span>
                    : (resumo?.clientes_ativos ?? 0)}
                </div>
              )}
              <Link to="/clientes" className="text-xs text-primary hover:underline">Ver clientes →</Link>
              <p className="text-[10px] text-muted-foreground">Agora</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Prioridades imediatas + Fluxo do dia — dependem da RPC executiva.
          Quando ela falha, mantemos o card visível com estado "indisponível"
          amigável (sem zerar valores) para não bloquear o resto da página. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Prioridades imediatas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {resumoQ.isLoading && <Skeleton className="h-20" />}
            {resumoErr && !resumoQ.isLoading && (
              <p className="text-sm text-muted-foreground italic">Indisponível no momento.</p>
            )}
            {!resumoQ.isLoading && !resumoErr && prioridadeIndisponivel && (
              <p className="text-sm text-muted-foreground italic">Indisponível no momento.</p>
            )}
            {!resumoQ.isLoading && !resumoErr && !prioridadeIndisponivel && (resumo?.solicitacoes_criticas ?? 0) === 0 && (resumo?.visitas_atrasadas ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground italic">Sem prioridades críticas.</p>
            )}
            {!resumoErr && !indisp.has("solicitacoes_criticas") && (resumo?.solicitacoes_criticas ?? 0) > 0 && (
              <Link to="/solicitacoes?urgencia=critica" className="block border rounded p-2 hover:bg-accent">
                <div className="text-sm font-medium">Solicitações críticas</div>
                <div className="text-xs text-muted-foreground">{resumo?.solicitacoes_criticas} pendente(s)</div>
              </Link>
            )}
            {!resumoErr && !indisp.has("visitas_atrasadas") && (resumo?.visitas_atrasadas ?? 0) > 0 && (
              <Link to="/agenda-tecnica" className="block border rounded p-2 hover:bg-accent">
                <div className="text-sm font-medium">Visitas atrasadas</div>
                <div className="text-xs text-muted-foreground">{resumo?.visitas_atrasadas} agendamento(s)</div>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fluxo do dia <span className="text-[10px] font-normal text-muted-foreground">(Hoje)</span></CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <StatMini label="Check-ins hoje" value={resumo?.checkins_hoje} loading={resumoQ.isLoading} error={resumoErr || indisp.has("checkins_hoje")} />
            <StatMini label="Visitas hoje" value={resumo?.visitas_hoje} loading={resumoQ.isLoading} error={resumoErr || indisp.has("visitas_hoje")} />
            <StatMini label="OS abertas" value={resumo?.os_abertas} loading={resumoQ.isLoading} error={resumoErr || indisp.has("os_abertas")} />
            <StatMini label="Recom. pendentes" value={resumo?.recomendacoes_pendentes} loading={resumoQ.isLoading} error={resumoErr || indisp.has("recomendacoes_pendentes")} />
          </CardContent>
        </Card>
      </div>


      {/* Situação resumida do laboratório */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" /> Situação do Laboratório <span className="text-[10px] font-normal text-muted-foreground">(Agora)</span>
          </CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link to="/cockpit-laboratorio">
              Abrir Cockpit Laboratório <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <LabTile icon={Activity} label="OS aguardando"     value={lab?.os_aguardando}     to="/ordens-servico?status=aberta" loading={labQ.isLoading} error={labErr || lab?.indisponiveis.has("os_aguardando")} />
          <LabTile icon={Package}  label="Lotes em produção" value={lab?.lotes_producao}    to="/lotes"   loading={labQ.isLoading} error={labErr || lab?.indisponiveis.has("lotes_producao")} />
          <LabTile icon={ShieldCheck} label="CQ pendente"    value={lab?.cq_pendente}       to="/controle-qualidade"          loading={labQ.isLoading} error={labErr || lab?.indisponiveis.has("cq_pendente")} />
          <LabTile icon={Warehouse} label="Envases pendentes" value={lab?.envases_pendentes} to="/envase"                     loading={labQ.isLoading} error={labErr || lab?.indisponiveis.has("envases_pendentes")} />
          <LabTile icon={Layers}   label="Insumos críticos"   value={lab?.insumos_criticos}  to="/estoque"                    loading={labQ.isLoading} error={labErr || lab?.indisponiveis.has("insumos_criticos")} />
          <LabTile icon={Truck}    label="Entregas pendentes" value={lab?.entregas_pendentes} to="/entregas"                  loading={labQ.isLoading} error={labErr || lab?.indisponiveis.has("entregas_pendentes")} />
        </CardContent>
      </Card>


      {/* Acesso rápido às visões detalhadas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acesso rápido</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/dashboard/executivo">Ver Visão Executiva</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/dashboard/operacional">Ver Visão Operacional</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/bi-agronomico">BI Agronômico</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/bi-operacional">BI Operacional</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/relatorios">Relatórios</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatMini({ label, value, loading, error }: { label: string; value?: number | null; loading?: boolean; error?: boolean }) {
  return (
    <div className="border rounded p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="h-6 w-12 mt-1" /> : error ? (
        <p className="text-sm text-muted-foreground mt-1" title="Consulta indisponível">Indisponível</p>
      ) : (
        <p className="text-xl font-bold">{value ?? 0}</p>
      )}
    </div>
  );
}

function LabTile({
  icon: Icon, label, value, to, loading, error,
}: {
  icon: LucideIcon; label: string; value?: number; to: string; loading?: boolean; error?: boolean;
}) {

  return (
    <Link to={to} className="border rounded p-2 hover:bg-accent transition-colors">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      {loading ? <Skeleton className="h-6 w-10 mt-1" /> : error ? (
        <div className="text-sm text-muted-foreground mt-1" title="Consulta indisponível">Indisponível</div>
      ) : (
        <div className="text-xl font-bold mt-1">{value ?? 0}</div>
      )}
    </Link>
  );
}

