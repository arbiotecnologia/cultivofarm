import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateDisplay } from "@/lib/date-utils";
import { Beaker, QrCode, Bell, CheckCircle2, FlaskConical, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";

export interface PortalOrdensServicoProps {
  embedded?: boolean;
  highlightedOsId?: string | null;
  highlightedOnfarmOsId?: string | null;
}


const OS_STEPS = [
  { key: "aberta", label: "Solicitada", icon: Bell },
  { key: "aprovada", label: "Aprovada", icon: CheckCircle2 },
  { key: "programada", label: "Em Fila", icon: FlaskConical },
  { key: "em_producao", label: "Produção", icon: Beaker },
  { key: "em_cq", label: "Qualidade", icon: FlaskConical },
  { key: "envase", label: "Envase", icon: FlaskConical },
  { key: "pronto_entrega", label: "Pronta", icon: CheckCircle2 },
  { key: "entregue", label: "Entregue", icon: CheckCircle2 },
  { key: "finalizada", label: "Concluída", icon: CheckCircle2 },
];


function Timeline({ status }: { status: string }) {
  const currentIdx = OS_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center justify-between gap-1 w-full max-w-full overflow-x-auto pb-4 no-scrollbar pt-2 px-2">
      {OS_STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i <= currentIdx;
        const isCurrent = i === currentIdx;
        
        return (
          <div key={step.key} className="flex flex-col items-center min-w-[60px] relative">
            <div className={cn(
              "z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500",
              isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110" : "bg-muted text-muted-foreground grayscale",
              isCurrent && "ring-4 ring-primary/20 animate-pulse"
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <span className={cn(
              "text-[9px] mt-2 font-bold uppercase tracking-tight text-center whitespace-nowrap",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              {step.label}
            </span>
            {i < OS_STEPS.length - 1 && (
              <div className={cn(
                "absolute top-5 left-[calc(50%+20px)] w-[calc(100%-40px)] h-1 transition-colors duration-500",
                i < currentIdx ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}


const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta", aprovada: "Aprovada", programada: "Programada",
  em_producao: "Em Produção", em_cq: "Controle de Qualidade", envase: "Envase",
  pronto_entrega: "Pronto p/ Entrega", entregue: "Entregue", finalizada: "Finalizada",
};

export default function PortalOrdensServico({
  embedded = false,
  highlightedOsId = null,
  highlightedOnfarmOsId = null,
}: PortalOrdensServicoProps = {}) {
  const { clienteId, loading: cl } = usePortalCliente();
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLaudo, setSelectedCq] = useState<any | null>(null);

  useEffect(() => {
    if (!clienteId) return;
    const fetch = async () => {
      const { data: oManual } = await supabase.from("ordens_servico")
        .select("*, fazendas(nome), talhoes(nome), produtos(nome), programacao_producao(lotes(*, controle_qualidade(*)))")
        .eq("cliente_id", clienteId);

      const { data: oOnfarm } = await supabase.from("ordens_servico_onfarm")
        .select("*, fazendas(nome), talhoes(nome), produtos(nome), programacao_producao(lotes(*, controle_qualidade(*)))")
        .eq("cliente_id", clienteId);

      const merged = [
        ...(oManual || []).map((o: any) => ({ ...o, _tipo: "manual" as const })),
        ...(oOnfarm || []).map((o: any) => ({ ...o, _tipo: "onfarm" as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrdens(merged);
      setLoading(false);
    };
    fetch();
  }, [clienteId]);

  if (cl || loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6">
      {!embedded && <h1 className="text-2xl font-bold">Ordens de Serviço</h1>}
      {ordens.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma ordem de serviço encontrada.</p>
      ) : (
        <div className="space-y-4">
          {ordens.map((os) => {
            const programacoes = (os.programacao_producao ?? []) as any[];
            const lotes = programacoes[0]?.lotes || [];
            const cq = lotes?.[0]?.controle_qualidade?.[0];
            const podeVerLaudo = !!cq && (os.status === "envase" || os.status === "pronto_entrega" || os.status === "entregue" || os.status === "finalizada");
            const temProducao = programacoes.length > 0;
            const isSelected =
              (os._tipo === "manual" && highlightedOsId === os.id) ||
              (os._tipo === "onfarm" && highlightedOnfarmOsId === os.id);

            const goProducao = () => {
              const key = os._tipo === "onfarm" ? "os_onfarm" : "os";
              navigate(`/portal/acompanhamento?tab=producao&${key}=${os.id}`);
            };

            return (
              <Card
                key={`${os._tipo}-${os.id}`}
                className={cn(
                  "border-none shadow-md overflow-hidden bg-gradient-to-br from-background to-muted/30 transition-all",
                  isSelected && "ring-2 ring-primary bg-primary/5",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex flex-col">
                      <p className="text-[10px] uppercase font-bold text-primary tracking-widest">{os.numero_os || "Ref: Nova"}</p>
                      <CardTitle className="text-lg font-black tracking-tight italic">{(os.produtos as any)?.nome || "Bioinsumo Especial"}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isSelected && (
                        <Badge className="h-7 px-2 text-[10px] bg-primary/10 text-primary border border-primary/30" variant="outline">
                          Selecionada
                        </Badge>
                      )}
                      {temProducao && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1"
                          onClick={goProducao}
                          aria-label="Ver produção"
                        >
                          <ArrowRight className="h-3 w-3" /> Ver produção
                        </Button>
                      )}
                      {podeVerLaudo && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1 border-primary/20 bg-primary/5 hover:bg-primary/10"
                          onClick={() => setSelectedCq(cq)}
                        >
                          <QrCode className="h-3 w-3" /> Laudo Digital
                        </Button>
                      )}
                      <Badge variant={os.status === "finalizada" ? "default" : "secondary"} className="h-7 px-3 text-[10px] font-bold">
                        {STATUS_LABELS[os.status] || os.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="text-xs font-medium text-muted-foreground flex flex-wrap gap-x-4 gap-y-2 p-3 bg-background/50 rounded-lg border border-dashed">
                    <span className="flex items-center gap-1">📍 {(os.fazendas as any)?.nome}</span>
                    <span className="flex items-center gap-1">🌱 {(os.talhoes as any)?.nome}</span>
                    {os.volume_total_ml && <span className="flex items-center gap-1">🧪 {os.volume_total_ml / 1000} L</span>}
                    {os.area_hectares && <span className="flex items-center gap-1">📐 {os.area_hectares} ha</span>}

                    {os.data_programada && <span className="flex items-center gap-1">📅 {formatDateDisplay(os.data_programada)}</span>}
                    {os.data_recomendada && <span className="flex items-center gap-1">📅 {formatDateDisplay(os.data_recomendada)}</span>}
                  </div>
                  <Timeline status={os.status} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}


      <Dialog open={!!selectedLaudo} onOpenChange={(o) => !o && setSelectedCq(null)}>
        <DialogContent className="max-w-2xl bg-slate-50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Laudo de Análise de Qualidade (Digital)
            </DialogTitle>
          </DialogHeader>
          {selectedLaudo && (
            <div className="space-y-6 py-4 bg-white p-6 rounded-xl border shadow-inner">
              <div className="flex justify-between items-start border-b pb-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Responsável Técnico</p>
                  <p className="text-sm font-bold">{selectedLaudo.responsavel || "Laboratório Central Cultivo Farm"}</p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">ANÁLISE APROVADA</Badge>
                  <p className="text-[9px] text-muted-foreground mt-1">{formatDateDisplay(selectedLaudo.data_analise)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div className="p-3 bg-muted/20 rounded-lg text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">pH</p>
                  <p className="text-2xl font-black text-primary">{selectedLaudo.ph ?? "—"}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Concentração</p>
                  <p className="text-2xl font-black text-primary">{formatConcentracaoDisplay(selectedLaudo.concentracao)}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Vigência</p>
                  <p className="text-sm font-bold mt-2">90 DIAS</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Avaliação Organoléptica</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                  <div className="p-2 border rounded border-dashed text-center">
                    <p className="text-muted-foreground">APARÊNCIA</p>
                    <p className="font-bold">{selectedLaudo.aparencia || "NORMAL"}</p>
                  </div>
                  <div className="p-2 border rounded border-dashed text-center">
                    <p className="text-muted-foreground">ODOR</p>
                    <p className="font-bold">{selectedLaudo.odor || "CARACTERÍSTICO"}</p>
                  </div>
                  <div className="p-2 border rounded border-dashed text-center">
                    <p className="text-muted-foreground">CONTAMINAÇÃO</p>
                    <p className="font-bold text-emerald-600">AUSENTE</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-emerald-900 p-4 text-white flex items-center justify-between shadow-lg">
                <div>
                  <p className="text-[10px] opacity-70 uppercase font-bold tracking-tighter">Certificação de Segurança</p>
                  <p className="text-sm font-black italic">PRODUTO BIOATIVO LIBERADO PARA USO</p>
                </div>
                <QrCode className="h-8 w-8 opacity-20" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
