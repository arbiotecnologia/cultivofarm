import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, AlertTriangle, ArrowRight, DollarSign, FlaskConical,
  Package, Truck, Users, ShieldCheck, Warehouse, Layers,
} from "lucide-react";
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

  // Situação resumida do laboratório (regra 13) — queries agregadas leves.
  const labQ = useQuery({
    queryKey: ["dashboard-geral-lab-resumo"],
    queryFn: async () => {
      const [os, lotes, cq, envases, insumos, entregas] = await Promise.all([
        supabase.from("ordens_servico_onfarm").select("id", { count: "exact", head: true }).eq("status", "aberta"),
        supabase.from("lotes").select("id", { count: "exact", head: true }).eq("status", "em_producao"),
        supabase.from("controle_qualidade").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        supabase.from("envases").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        supabase.from("produtos").select("id, estoque_minimo, estoque_produto(volume_total)").eq("e_insumo", true),
        supabase.from("entregas").select("id", { count: "exact", head: true }).in("status", ["pendente", "programada"]),
      ]);
      const insumosCriticos = (insumos.data || []).filter((p: any) => {
        const total = (p.estoque_produto || []).reduce((a: number, x: any) => a + Number(x.volume_total || 0), 0);
        return total < Number(p.estoque_minimo || 0);
      }).length;
      return {
        os_aguardando: os.count ?? 0,
        lotes_producao: lotes.count ?? 0,
        cq_pendente: cq.count ?? 0,
        envases_pendentes: envases.count ?? 0,
        insumos_criticos: insumosCriticos,
        entregas_pendentes: entregas.count ?? 0,
      };
    },
    staleTime: 60_000,
    retry: false,
  });

  const resumo = resumoQ.data?.resumo;
  const saude = resumoQ.data?.saude_operacional;
  const lab = labQ.data;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Visão Geral</h1>
          <p className="text-sm text-muted-foreground">
            Saúde operacional, alertas, financeiro, laboratório e prioridades imediatas.
          </p>
        </div>
      </header>

      {/* Linha 1: Saúde + Alertas + Financeiro + Carteira */}
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
              <div className="text-3xl font-bold">{resumo?.alertas_ativos ?? 0}</div>
            )}
            <Link to="/alertas-operacionais" className="text-xs text-primary hover:underline">Ver alertas →</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Situação Financeira
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumoQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold">
                {resumo?.receita_bruta != null
                  ? Number(resumo.receita_bruta).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                  : "—"}
              </div>
            )}
            <Link to="/financeiro" className="text-xs text-primary hover:underline">Abrir financeiro →</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Saúde da Carteira
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumoQ.isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold">{resumo?.clientes_ativos ?? 0}</div>
            )}
            <Link to="/clientes" className="text-xs text-primary hover:underline">Ver clientes →</Link>
          </CardContent>
        </Card>
      </div>

      {/* Prioridades imediatas + Fluxo do dia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Prioridades imediatas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {resumoQ.isLoading && <Skeleton className="h-20" />}
            {!resumoQ.isLoading && (resumo?.solicitacoes_criticas ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground italic">Sem prioridades críticas.</p>
            )}
            {(resumo?.solicitacoes_criticas ?? 0) > 0 && (
              <Link to="/solicitacoes?urgencia=critica" className="block border rounded p-2 hover:bg-accent">
                <div className="text-sm font-medium">Solicitações críticas</div>
                <div className="text-xs text-muted-foreground">{resumo?.solicitacoes_criticas} pendente(s)</div>
              </Link>
            )}
            {(resumo?.visitas_atrasadas ?? 0) > 0 && (
              <Link to="/agenda-tecnica?filtro=atrasadas" className="block border rounded p-2 hover:bg-accent">
                <div className="text-sm font-medium">Visitas atrasadas</div>
                <div className="text-xs text-muted-foreground">{resumo?.visitas_atrasadas} agendamento(s)</div>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fluxo do dia</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <StatMini label="Check-ins hoje" value={resumo?.checkins_hoje} loading={resumoQ.isLoading} />
            <StatMini label="Visitas hoje" value={resumo?.visitas_hoje} loading={resumoQ.isLoading} />
            <StatMini label="OS abertas" value={resumo?.os_abertas} loading={resumoQ.isLoading} />
            <StatMini label="Recom. pendentes" value={resumo?.recomendacoes_pendentes} loading={resumoQ.isLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Situação resumida do laboratório */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" /> Situação do Laboratório
          </CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link to="/cockpit-laboratorio">
              Abrir Cockpit Laboratório <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <LabTile icon={Activity} label="OS aguardando"     value={lab?.os_aguardando}     to="/ordens-servico?status=aberta" loading={labQ.isLoading} />
          <LabTile icon={Package}  label="Lotes em produção" value={lab?.lotes_producao}    to="/lotes?status=em_producao"   loading={labQ.isLoading} />
          <LabTile icon={ShieldCheck} label="CQ pendente"    value={lab?.cq_pendente}       to="/controle-qualidade"          loading={labQ.isLoading} />
          <LabTile icon={Warehouse} label="Envases pendentes" value={lab?.envases_pendentes} to="/envase"                     loading={labQ.isLoading} />
          <LabTile icon={Layers}   label="Insumos críticos"   value={lab?.insumos_criticos}  to="/estoque"                    loading={labQ.isLoading} />
          <LabTile icon={Truck}    label="Entregas pendentes" value={lab?.entregas_pendentes} to="/entregas"                  loading={labQ.isLoading} />
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

function StatMini({ label, value, loading }: { label: string; value?: number | null; loading?: boolean }) {
  return (
    <div className="border rounded p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="h-6 w-12 mt-1" /> : (
        <p className="text-xl font-bold">{value ?? 0}</p>
      )}
    </div>
  );
}

function LabTile({
  icon: Icon, label, value, to, loading,
}: {
  icon: any; label: string; value?: number; to: string; loading?: boolean;
}) {
  return (
    <Link to={to} className="border rounded p-2 hover:bg-accent transition-colors">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      {loading ? <Skeleton className="h-6 w-10 mt-1" /> : (
        <div className="text-xl font-bold mt-1">{value ?? 0}</div>
      )}
    </Link>
  );
}
