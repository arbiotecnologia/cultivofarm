import React, { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, Calendar, Save, Loader2, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useVisitaWorkspace } from "@/hooks/useVisitaWorkspace";
import { EncerramentoState } from "./EncerramentoCard";
import { formatDateDisplay } from "@/lib/date-utils";
import { serializePlanoMonitoramento, parsePlanoMonitoramento, stripPlanoMonitoramento } from "@/lib/planoMonitoramento";

interface PlanoMonitoramentoEditorProps {
  readOnly?: boolean;
  registroId: string;
  observacoesAtuais: string;
  dataProximaVisita?: string;
  clienteId: string;
  fazendaId: string;
  talhaoId: string;
  consultorId: string;
  onUpdate: () => void;
}

export function PlanoMonitoramentoEditor({
  readOnly = true,
  registroId,
  observacoesAtuais,
  dataProximaVisita,
  talhaoId,
  onUpdate
}: PlanoMonitoramentoEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const workspace = useVisitaWorkspace(registroId);
  const locked = readOnly || workspace.isError || !workspace.data?.permissions.can_edit ||
    !["rascunho", "em_andamento"].includes(workspace.data?.status ?? "");
  const writeLock = useRef(false);
  
  const initialPlano = parsePlanoMonitoramento(observacoesAtuais);
  
  const [state, setState] = useState<EncerramentoState>({
    resumoFinal: "",
    liberadoCliente: true,
    exigirAprovacao: false,
    proximoPasso: "monitorar_area",
    dataProximaVisita: dataProximaVisita || initialPlano?.dataProximaVisita || "",
    monitoramentoItens: initialPlano?.monitoramentoItens || [],
    monitoramentoFrequencia: initialPlano?.monitoramentoFrequencia || "14",
    monitoramentoGatilhos: initialPlano?.monitoramentoGatilhos || "",
    osItens: [],
    osDataAplicacao: "",
    osObservacoes: "",
    retornoTurno: "qualquer",
    retornoDuracaoMin: 60,
    retornoLembreteDias: 1,
    retornoNotificarProdutor: false,
  });

  const toggleMonitorar = (item: string) => {
    const current = state.monitoramentoItens || [];
    const next = current.includes(item) 
      ? current.filter(i => i !== item) 
      : [...current, item];
    setState({ ...state, monitoramentoItens: next });
  };

  const handleSave = async () => {
    if (locked || writeLock.current) return;
    if (!state.monitoramentoItens || state.monitoramentoItens.length === 0) {
      toast.error("Selecione pelo menos um item para monitorar");
      return;
    }
    if (!state.dataProximaVisita) {
      toast.error("Selecione a data da próxima avaliação");
      return;
    }

    writeLock.current = true;
    setIsSaving(true);
    try {
      const current = await workspace.refetch();
      if (current.isError || !current.data?.permissions.can_edit ||
          !["rascunho", "em_andamento"].includes(current.data.status ?? "")) throw new Error("Conteúdo somente para leitura.");
      const cleanObs = stripPlanoMonitoramento(observacoesAtuais);
      const newPlanoBlock = serializePlanoMonitoramento(state);
      const finalObs = `${cleanObs}\n\n${newPlanoBlock}`.trim();

      const { data: updated, error: updateError } = await supabase
        .from("registros_consultor")
        .update({
          observacoes_tecnicas: finalObs,
          data_proxima_visita: state.dataProximaVisita
        })
        .eq("id", registroId).eq("version", current.data.version).select("id").single();

      if (updateError) throw updateError;
      if (!updated) throw new Error("Não foi possível confirmar a atualização.");

      // Atualizar alerta agronômico vinculado
      const { data: alerta, error: alertReadError } = await supabase
        .from("alertas_agronomicos")
        .select("id")
        .eq("talhao_id", talhaoId)
        .eq("status", "ativo")
        .ilike("tipo_alerta", "monitoramento")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alertReadError) throw alertReadError;

      if (alerta) {
        const { error: alertError } = await supabase
          .from("alertas_agronomicos")
          .update({
            data_alerta: state.dataProximaVisita,
            descricao: `Área em monitoramento: ${state.monitoramentoItens.join(", ")}`
          })
          .eq("id", alerta.id);
        if (alertError) throw alertError;
      }

      toast.success("Plano de monitoramento atualizado!");
      setIsOpen(false);
      onUpdate();
    } catch {
      toast.error("Não foi possível concluir a atualização do plano. Reconsulte a visita.");
    } finally {
      writeLock.current = false;
      setIsSaving(false);
    }
  };

  return (
    <>
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-600" />
            <CardTitle className="text-sm font-semibold text-emerald-800">Monitoramento Ativo</CardTitle>
          </div>
          <Button variant="outline" size="sm" disabled={locked} onClick={() => { if (!locked) setIsOpen(true); }} className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-100">
            Editar Plano
          </Button>
        </CardHeader>
        <CardContent className="py-2 px-4 space-y-2">
          <div className="flex flex-wrap gap-1">
            {state.monitoramentoItens?.map(item => (
              <span key={item} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-200">
                {item}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Próxima: {state.dataProximaVisita ? formatDateDisplay(state.dataProximaVisita + "T12:00:00") : "Não definida"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium text-emerald-700">{state.monitoramentoFrequencia} dias</span>
            </div>
          </div>
          <Button 
            className="w-full h-8 text-xs mt-2 bg-emerald-600 hover:bg-emerald-700 text-white" 
            disabled={true}
          >
            <PlusCircle className="h-3 w-3 mr-2" />
            Agendamento indisponível
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-emerald-600" />
              Editar Plano de Monitoramento
            </DialogTitle>
          </DialogHeader>
          
          <fieldset disabled={locked || isSaving} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase font-bold">O que monitorar?</Label>
              <div className="flex flex-wrap gap-1.5">
                {["Pragas", "Doenças", "Plantas Daninhas", "Nutrição", "Clima", "Estande"].map((item) => (
                  <Button
                    key={item}
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMonitorar(item)}
                    className={cn(
                      "h-7 px-2 text-[10px] rounded-full transition-all",
                      state.monitoramentoItens?.includes(item)
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-background border-emerald-200 text-emerald-700"
                    )}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase font-bold">Frequência</Label>
                <Select disabled={locked || isSaving}
                  value={state.monitoramentoFrequencia} 
                  onValueChange={(val) => setState({ ...state, monitoramentoFrequencia: val })}
                >
                  <SelectTrigger className="h-9 text-xs border-emerald-200">
                    <SelectValue placeholder="Dias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="14">14 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase font-bold">Próxima Data</Label>
                <Input
                  type="date"
                  value={state.dataProximaVisita}
                  onChange={(e) => setState({ ...state, dataProximaVisita: e.target.value })}
                  className="h-9 text-xs border-emerald-200"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase font-bold">Gatilhos de Antecipação</Label>
              <Textarea
                rows={2}
                value={state.monitoramentoGatilhos}
                onChange={(e) => setState({ ...state, monitoramentoGatilhos: e.target.value })}
                placeholder="Ex: Em caso de chuva superior a 20mm..."
                className="text-xs border-emerald-200"
              />
            </div>
          </fieldset>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving || locked} className="bg-emerald-600 hover:bg-emerald-700">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
