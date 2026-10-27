import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, Calendar, Save, Loader2, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MonitoringPlanSaveError, useSalvarPlanoMonitoramento } from "@/hooks/useSalvarPlanoMonitoramento";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { useVisitaWorkspace } from "@/hooks/useVisitaWorkspace";
import { EncerramentoState } from "./EncerramentoCard";
import { formatDateDisplay } from "@/lib/date-utils";
import { parsePlanoMonitoramento } from "@/lib/planoMonitoramento";

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
  onUpdate
}: PlanoMonitoramentoEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const workspace = useVisitaWorkspace(registroId);
  const save = useSalvarPlanoMonitoramento(registroId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const observed = useRef<number | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string; uncertain: boolean } | null>(null);
  const [rejected, setRejected] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState<{ version: number; current: () => boolean } | null>(null);
  const reviewLock = useRef(false);
  const minimumVersion = useRef<number | null>(null);
  useEffect(() => {
    setIsOpen(false); setSaveError(null); observed.current = null; attempt.current = null;
    setRejected(false); setReview(null); minimumVersion.current = null;
    setState(previous => ({ ...previous, monitoramentoItens: [], monitoramentoGatilhos: "", dataProximaVisita: "" }));
  }, [save.scope]);
  const locked = readOnly || workspace.isError || !workspace.data?.permissions.can_edit ||
    !["rascunho", "em_andamento"].includes(workspace.data?.status ?? "");
  const writeLock = useRef(false);
  
  const authorized = save.ready && !workspace.isError && workspace.data?.permissions.can_view !== false;
  const displayRegistro = authorized ? workspace.data?.registro : null;
  const displayPlan = parsePlanoMonitoramento(displayRegistro?.observacoes_tecnicas);
  const displayDate = displayRegistro?.data_proxima_visita ?? displayPlan?.dataProximaVisita ?? "";
  const aviso = authorized ? workspace.data?.monitoramento?.find(a => a.tipo === "plano_monitoramento" && a.registro_consultor_id === registroId) : null;
  
  const [state, setState] = useState<EncerramentoState>({
    resumoFinal: "",
    liberadoCliente: true,
    exigirAprovacao: false,
    proximoPasso: "monitorar_area",
    dataProximaVisita: "",
    monitoramentoItens: [],
    monitoramentoFrequencia: "14",
    monitoramentoGatilhos: "",
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

  const openEditor = () => {
    if (locked || !save.ready) return;
    // Capture fields and version from ONE observed envelope, never refetch during save.
    if (observed.current === null) {
      const registro = workspace.data?.registro;
      const text = registro?.observacoes_tecnicas;
      const version = workspace.data?.version;
      if (!Number.isSafeInteger(version) || !version || version <= 0 ||
        (minimumVersion.current !== null && version < minimumVersion.current) ||
        !(text === null || typeof text === "string")) {
        toast.error("Revisão do plano indisponível. Atualize a visita antes de editar.");
        return;
      }
      const plan = parsePlanoMonitoramento(text);
      observed.current = version;
      setState(previous => ({ ...previous,
        monitoramentoItens: plan?.monitoramentoItens ?? [],
        monitoramentoFrequencia: plan?.monitoramentoFrequencia ?? "14",
        monitoramentoGatilhos: plan?.monitoramentoGatilhos ?? "",
        dataProximaVisita: registro?.data_proxima_visita ?? plan?.dataProximaVisita ?? "",
      }));
    }
    setIsOpen(true);
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
    setSaveError(null);
    const current = save.capture();
    try {
      const plan = { items: state.monitoramentoItens, frequency: state.monitoramentoFrequencia,
        triggers: state.monitoramentoGatilhos, next_date: state.dataProximaVisita };
      const expectedVersion = observed.current;
      if (expectedVersion === null) throw new Error("Revisão da visita indisponível. O plano foi mantido.");
      const fingerprint = JSON.stringify([registroId, expectedVersion, plan]);
      if (attempt.current && attempt.current.fingerprint !== fingerprint) throw new Error("Há um salvamento não confirmado. Preserve a edição enviada antes de tentar novamente.");
      attempt.current ??= { fingerprint, key: crypto.randomUUID(), uncertain: false };
      await save.mutateAsync({ registroId, expectedVersion, plan, requestId: attempt.current.key });
      if (!current()) return;
      attempt.current = null;
      observed.current = null; minimumVersion.current = expectedVersion + 1;
      setRejected(false); setReview(null);
      toast.success("Plano de monitoramento atualizado!");
      setIsOpen(false);
      onUpdate();
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : "Não foi possível confirmar o plano. A edição foi mantida.";
      if (error instanceof MonitoringPlanSaveError && error.outcome === "rejected" && !attempt.current?.uncertain) {
        setRejected(true);
      } else {
        if (attempt.current) attempt.current.uncertain = true;
        setRejected(false);
      }
      setSaveError(message); toast.error(message);
    } finally {
      writeLock.current = false;
      setIsSaving(false);
    }
  };

  const reconsultar = async () => {
    if (!rejected || writeLock.current || reviewLock.current || locked) return;
    const current = save.capture(); reviewLock.current = true; setIsReviewing(true);
    try {
      const response = await workspace.refetch();
      if (!current()) return;
      const ws = response.data;
      if (response.isError || !ws?.permissions.can_edit || !["rascunho", "em_andamento"].includes(ws.status ?? "") ||
        !Number.isSafeInteger(ws.version) || !ws.version || ws.version <= 0) throw new Error("Não foi possível revisar a visita. O plano foi mantido.");
      setReview({ version: ws.version, current });
    } catch (error) { if (current()) setSaveError(error instanceof Error ? error.message : "Não foi possível revisar a visita."); }
    finally { reviewLock.current = false; if (current()) setIsReviewing(false); }
  };
  const confirmarRevisao = () => {
    if (!review || !review.current() || locked || writeLock.current || !rejected || attempt.current?.uncertain ||
      workspace.data?.version !== review.version) { setReview(null); return; }
    observed.current = review.version; attempt.current = null; setRejected(false); setSaveError(null); setReview(null);
  };

  return (
    <>
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-600" />
            <CardTitle className="text-sm font-semibold text-emerald-800">Monitoramento Ativo</CardTitle>
          </div>
          <Button variant="outline" size="sm" disabled={locked || !save.ready} onClick={openEditor} className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-100">
            Editar Plano
          </Button>
        </CardHeader>
        <CardContent className="py-2 px-4 space-y-2">
          <div className="flex flex-wrap gap-1">
            {displayPlan?.monitoramentoItens?.map(item => (
              <span key={item} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-200">
                {item}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Próxima: {displayDate ? formatDateDisplay(displayDate + "T12:00:00") : "Não definida"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium text-emerald-700">{displayPlan?.monitoramentoFrequencia ?? "14"} dias</span>
            </div>
          </div>
          {aviso && <p className="text-xs text-muted-foreground">Aviso desta visita · {displayRegistro?.codigo_visita ?? registroId} · {aviso.id}</p>}
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
            <DialogDescription>Atualizar o plano desta visita.</DialogDescription>
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
                  min={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}
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

          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          {rejected && <Button variant="outline" disabled={locked || isSaving || isReviewing} onClick={reconsultar}>Reconsultar e revisar</Button>}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving || locked || rejected || isReviewing} className="bg-emerald-600 hover:bg-emerald-700">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={review !== null} onOpenChange={open => { if (!open) setReview(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revisar plano antes de salvar?</AlertDialogTitle>
            <AlertDialogDescription>Visita {displayRegistro?.codigo_visita ?? registroId}, revisão {review?.version}. Seu plano editado será preservado. Confirmar permite uma nova tentativa; não salva automaticamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>Cancelar revisão</Button>
            <Button onClick={confirmarRevisao}>Confirmar revisão</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
