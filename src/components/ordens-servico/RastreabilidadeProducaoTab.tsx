import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ClipboardList, FlaskConical, ShieldCheck, Package, 
  Warehouse, Truck, Sprout, Clock, CheckCircle2,
  Info, User, Calendar, AlertTriangle, History
} from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { diaSP } from "@/lib/ordens-servico/validacao";
import { Skeleton } from "@/components/ui/skeleton";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";
import { cn } from "@/lib/utils";


interface Props {
  osId: string;
  osTipo: 'manual' | 'onfarm';
}

export function RastreabilidadeProducaoTab({ osId, osTipo }: Props) {
  const { data: trace, isLoading, isError, refetch } = useQuery({
    queryKey: ["os-trace", osTipo, osId],
    queryFn: async () => {
      const checked = async (query: PromiseLike<{ data: any; error: any }>) => {
        const result = await query;
        if (result.error) throw result.error;
        return result;
      };
      // 1. Integridade e Status Oficial
      const { data: integridade } = await checked((supabase as any)
        .from("vw_esteira_laboratorio")
        .select("*")
        .eq("os_id", osId)
        .eq("origem_os", osTipo)
        .maybeSingle());

      // 2. Programação
      const { data: programacoes } = await checked((supabase as any)
        .from("programacao_producao")
        .select(`
          *,
          responsavel:profiles!programacao_producao_responsavel_id_fkey(nome)
        `)
        .eq(osTipo === 'onfarm' ? "ordem_servico_onfarm_id" : "ordem_servico_id", osId));

      const prog = programacoes?.[0];

      // 3. Lote
      const { data: lotes } = !prog?.id ? { data: [] } : await checked((supabase as any)
        .from("lotes")
        .select(`
          *,
          produtos(nome),
          microrganismos(nome, nome_cientifico)
        `)
        .eq("programacao_id", prog?.id || ""));

      const lote = lotes?.[0];

      // 4. CQ
      const { data: cqs } = !lote?.id ? { data: [] } : await checked((supabase as any)
        .from("controle_qualidade")
        .select("*")
        .eq("lote_id", lote?.id || ""));

      const cq = cqs?.[0];

      // 5. Envase
      const { data: envases } = !lote?.id ? { data: [] } : await checked((supabase as any)
        .from("envase")
        .select("*")
        .eq("lote_id", lote?.id || ""));

      const envase = envases?.[0];

      // 6. Estoque / Reserva
      const { data: estoques } = await checked((supabase as any)
        .from("estoque_produto")
        .select("*")
        .eq("reservado_para_os_id", osId));

      const estoque = estoques?.[0];

      // 7. Entrega
      const { data: entregas } = await checked((supabase as any)
        .from("entregas")
        .select("*")
        .eq(osTipo === 'onfarm' ? "ordem_servico_onfarm_id" : "ordem_servico_id", osId));

      const entrega = entregas?.[0];

      // 8. Aplicação
      const { data: aplicacoes } = await checked((supabase as any)
        .from("aplicacoes")
        .select("*")
        .eq(osTipo === 'onfarm' ? "ordem_servico_onfarm_id" : "ordem_servico_id", osId));

      const aplicacao = aplicacoes?.[0];

      // 9. Eventos de Auditoria (Timeline)
      const { data: eventos } = await checked((supabase as any)
        .from("laboratorio_esteira_eventos")
        .select("*")
        .eq("os_id", osId)
        .order("created_at", { ascending: true }));

      if ([programacoes, lotes, cqs, envases, estoques, entregas, aplicacoes].some(rows => rows?.length > 1)) throw new Error("Rastreabilidade múltipla: consultar Cockpit");
      return {
        integridade,
        prog,
        lote,
        cq,
        envase,
        estoque,
        entrega,
        aplicacao,
        eventos: eventos || []
      };
    },
    enabled: !!osId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (isError) return <div role="alert" className="space-y-3"><p>Não foi possível carregar a rastreabilidade completa ou há múltiplos registros nesta etapa. Consulte o Cockpit para detalhar.</p><Button onClick={() => void refetch()}>Tentar novamente</Button></div>;

  const Section = ({ title, icon: Icon, children, active }: { title: string, icon: any, children: React.ReactNode, active?: boolean }) => (
    <div className={cn(
      "relative pl-8 pb-8 last:pb-0 border-l-2",
      active ? "border-primary" : "border-muted"
    )}>
      <div className={cn(
        "absolute -left-[17px] top-0 h-8 w-8 rounded-full flex items-center justify-center border-2 bg-background z-10",
        active ? "border-primary text-primary shadow-sm" : "border-muted text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-3">
        <h4 className={cn("font-bold text-sm uppercase tracking-wider", active ? "text-primary" : "text-muted-foreground")}>
          {title}
        </h4>
        {children}
      </div>
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed bg-muted/30 text-muted-foreground text-xs italic">
      <Info className="h-3.5 w-3.5" />
      {message}
    </div>
  );

  const InfoRow = ({ label, value, icon: Icon }: { label: string, value: any, icon?: any }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</span>
      <div className="text-sm font-medium flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {value ?? "—"}
      </div>
    </div>
  );

  return (
    <div className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar py-2">
      <div className="flex flex-col gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
            <FlaskConical className="h-5 w-5" />
            Rastreabilidade Laboratorial
          </h3>
          <Separator />
        </div>


        {/* Banner de Governança */}
        <Card className={cn(
          "border-2 shadow-sm",
          trace?.integridade?.pode_finalizar ? "border-primary/20 bg-primary/5" : "border-amber-200 bg-amber-50/50"
        )}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Status Oficial da Esteira</p>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary hover:bg-primary px-3 py-1 text-sm font-bold">
                    {(trace?.integridade as any)?.status_esteira_oficial?.replace(/_/g, ' ').toUpperCase() || '—'}
                  </Badge>
                  {trace?.integridade?.pode_finalizar && (
                    <Badge className="bg-emerald-500 text-white gap-1 border-none">
                      <CheckCircle2 className="h-3 w-3" /> PRONTA PARA FINALIZAR
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Prioridade</p>
                <Badge variant={(trace?.integridade as any)?.prioridade === 'alta' ? 'destructive' : 'secondary'} className="font-bold">
                  {(trace?.integridade as any)?.prioridade?.toUpperCase() || '—'}
                </Badge>
              </div>
            </div>

            {(trace?.integridade as any)?.bloqueios && Array.isArray((trace.integridade as any).bloqueios) && (trace.integridade as any).bloqueios.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-white border border-amber-200">
                <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> Pendências Críticas de Fluxo
                </p>
                <ul className="space-y-1">
                  {((trace.integridade as any).bloqueios as any[]).map((b: any, i: number) => (
                    <li key={i} className="text-xs text-slate-600 flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {String(b)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 1. Programação */}
        <Section title="Programação de Produção" icon={ClipboardList} active={!!trace?.prog}>
          {trace?.prog ? (
            <Card className="border-muted shadow-none bg-muted/10">
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <InfoRow label="Data Programada" value={formatDateDisplay(trace.prog.data_programada)} icon={Calendar} />
                <InfoRow label="Responsável" value={trace.prog.responsavel?.nome} icon={User} />
                <InfoRow label="Prioridade" value={<Badge variant={(trace.integridade as any)?.prioridade === 'alta' ? 'destructive' : 'secondary'}>{(trace.integridade as any)?.prioridade?.toUpperCase() || '—'}</Badge>} />
                <InfoRow label="Status" value={<Badge variant="outline">{trace.prog.status.toUpperCase()}</Badge>} />
              </CardContent>
            </Card>
          ) : <EmptyState message="Aguardando programação de produção..." />}
        </Section>

        {/* 2. Lote */}
        <Section title="Produção e Lote" icon={FlaskConical} active={!!trace?.lote}>
          {trace?.lote ? (
            <Card className="border-muted shadow-none bg-muted/10">
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <InfoRow label="Código do Lote" value={trace.lote.codigo_lote} />
                <InfoRow label="Produto" value={trace.lote.produtos?.nome || trace.lote.microrganismos?.nome} />
                <InfoRow label="Volume Produzido" value={trace.lote.volume_produzido ? `${(trace.lote.volume_produzido / 1000).toFixed(1)} L` : "—"} />
                <InfoRow label="Data de Produção" value={formatDateDisplay(trace.lote.data_producao)} />
                <InfoRow label="Status" value={<Badge variant="outline">{trace.lote.status.toUpperCase()}</Badge>} />
              </CardContent>
            </Card>
          ) : <EmptyState message="Aguardando início da produção..." />}
        </Section>

        {/* 3. Controle de Qualidade */}
        <Section title="Controle de Qualidade" icon={ShieldCheck} active={!!trace?.cq}>
          {trace?.cq ? (
            <Card className={cn(
              "border-muted shadow-none",
              trace.cq.resultado === 'aprovado' ? "bg-status-aprovado/5 border-status-aprovado/20" : "bg-status-reprovado/5 border-status-reprovado/20"
            )}>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <InfoRow label="Data Análise" value={formatDateDisplay(trace.cq.data_analise)} />
                  <InfoRow label="Responsável" value={trace.cq.responsavel} />
                  <InfoRow label="Resultado" value={
                    <Badge variant={trace.cq.resultado === 'aprovado' ? 'default' : 'destructive'} className={trace.cq.resultado === 'aprovado' ? 'bg-status-aprovado' : ''}>
                      {trace.cq.resultado === 'aprovado' ? 'APROVADO' : trace.cq.resultado === 'reprovado' ? 'REPROVADO' : 'EM ANÁLISE'}
                    </Badge>
                  } />
                  <InfoRow label="Concentração" value={formatConcentracaoDisplay(trace.cq.concentracao)} />
                </div>
                <div className="grid grid-cols-3 gap-2 border-t pt-3">
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-muted-foreground">pH</p>
                    <p className="font-bold text-xs">{trace.cq.ph ?? "—"}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-muted-foreground">Odor</p>
                    <p className="font-bold text-xs">{trace.cq.odor || "—"}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-muted-foreground">Contaminação</p>
                    <p className="font-bold text-xs">{trace.cq.contaminacao ?? "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : <EmptyState message="Lote ainda não enviado para CQ ou em análise." />}
        </Section>

        {/* 4. Envase */}
        <Section title="Envase" icon={Package} active={!!trace?.envase}>
          {trace?.envase ? (
            <Card className="border-muted shadow-none bg-muted/10">
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <InfoRow label="Data Envase" value={formatDateDisplay(trace.envase.data_envase)} />
                <InfoRow label="Embalagem" value={trace.envase.tipo_embalagem.replace(/_/g, ' ').toUpperCase()} />
                <InfoRow label="Qtd. Unidades" value={trace.envase.quantidade} />
                <InfoRow label="Volume Unit." value={trace.envase.volume_por_unidade ? `${(trace.envase.volume_por_unidade / 1000).toFixed(1)} L` : "—"} />
              </CardContent>
            </Card>
          ) : <EmptyState message="Lote aguardando envase." />}
        </Section>

        {/* 5. Estoque e Reserva */}
        <Section title="Estoque / Reserva" icon={Warehouse} active={!!trace?.estoque}>
          {trace?.estoque ? (
            <Card className="border-muted shadow-none bg-blue-50/20 border-blue-100">
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <InfoRow label="Status Estoque" value={<Badge variant="secondary">{trace.estoque.status.replace(/_/g, ' ').toUpperCase()}</Badge>} />
                <InfoRow label="Qtd. Reservada" value={trace.estoque.quantidade_reservada} />
                <InfoRow label="Validade" value={formatDateDisplay(trace.estoque.validade)} />
                <InfoRow label="Lote Vinculado" value={trace.lote?.codigo_lote} />
              </CardContent>
            </Card>
          ) : <EmptyState message="Aguardando entrada no estoque e reserva." />}
        </Section>

        {/* 6. Entrega */}
        <Section title="Entrega / Expedição" icon={Truck} active={!!trace?.entrega}>
          {trace?.entrega ? (
            <Card className="border-muted shadow-none bg-muted/10">
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <InfoRow label="Status Entrega" value={<Badge variant="outline">{trace.entrega.status.toUpperCase()}</Badge>} />
                <InfoRow label="Motorista" value={trace.entrega.motorista} />
                <InfoRow label="Data Saída" value={formatDateDisplay(trace.entrega.data_saida)} />
                <InfoRow label="Entregue em" value={formatDateDisplay(trace.entrega.entregue_em)} />
              </CardContent>
            </Card>
          ) : <EmptyState message="Entrega não iniciada." />}
        </Section>

        <div className="space-y-4 mt-8">
          <h3 className="text-lg font-bold flex items-center gap-2 text-emerald-600">
            <Sprout className="h-5 w-5" />
            Pós-entrega / Aplicação (Informativa)
          </h3>
          <Separator />
          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-700 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>A aplicação em campo é um registro informativo de acompanhamento e não bloqueia o encerramento da OS laboratorial.</p>
          </div>
        </div>

        {/* 7. Aplicação */}
        <Section title="Status da Aplicação" icon={Sprout} active={!!trace?.aplicacao}>
          {trace?.aplicacao ? (
            <Card className="border-muted shadow-none bg-emerald-50/20 border-emerald-100">
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <InfoRow label="Data Aplicação" value={formatDateDisplay(trace.aplicacao.data_aplicacao)} />
                <InfoRow label="Dose Aplicada" value={`${trace.aplicacao.dose_aplicada} mL/ha`} />
                <InfoRow label="Área Aplicada" value={`${trace.aplicacao.area_aplicada_ha} ha`} />
                <InfoRow label="Responsável" value={trace.aplicacao.responsavel} />
                {trace.aplicacao.observacoes && (
                  <div className="col-span-2">
                    <InfoRow label="Observações" value={trace.aplicacao.observacoes} />
                  </div>
                )}
              </CardContent>
            </Card>
          ) : <EmptyState message="Aguardando aplicação no campo (Responsabilidade do Cliente)." />}
        </Section>

        <div className="space-y-4 mt-8">
          <h3 className="text-lg font-bold flex items-center gap-2 text-slate-600">
            <History className="h-5 w-5" />
            Histórico e Auditoria
          </h3>
          <Separator />
        </div>

        {/* 8. Timeline */}

        <Section title="Linha do Tempo da Esteira" icon={Clock} active={trace?.eventos.length > 0}>
          <div className="space-y-3 bg-muted/20 p-4 rounded-lg border">
            {trace?.eventos.length === 0 ? (
              <EmptyState message="Nenhum evento registrado na linha do tempo." />
            ) : trace?.eventos.map((ev: any) => (
              <div key={ev.id} className="flex gap-3 text-xs">
                <span className="text-muted-foreground font-mono shrink-0">
                  {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                </span>
                <div className="flex flex-col gap-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-status-aprovado" />
                    {ev.etapa_nova.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <span className="text-muted-foreground">{ev.observacao}</span>
                  <span className="text-[10px] text-muted-foreground italic">{formatDateDisplay(diaSP(ev.created_at))}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
