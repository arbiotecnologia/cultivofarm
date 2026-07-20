import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { 
  Loader2, CheckCircle2, Flag, Send, ChevronDown, ChevronUp, 
  FileText, ClipboardList, Gauge, Calendar, AlertCircle, 
  Lightbulb, ClipboardCheck, FileSearch, Plus, Trash2, Beaker,
  Clock, Bell, UserPlus, Info, Download, HelpCircle
} from "lucide-react";
import { formatDateDisplay, formatDateToISO, applyDateMask } from "@/lib/date-utils";
import { ChecklistFinalizacao, type ChecklistItem } from "@/components/visita/ChecklistFinalizacao";
import { PdfPreviewDialog } from "@/components/visita/PdfPreviewDialog";
import { type VisitaPdfData } from "@/lib/pdfVisita";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface EncerramentoOSItem {
  tipo?: "produto" | "microrganismo";
  produtoId: string;
  microrganismoId?: string;
  doseMlHa: string;
  areaHa: string;
  modoAplicacao: string;
  ordem?: number;
  intervaloDias?: string;
  obs?: string;
}

export interface EncerramentoRecItem {
  tipo: "produto" | "microrganismo";
  produtoId?: string;
  microrganismoId?: string;
  doseMlHa: string;
  areaHa: string;
  modoAplicacao: string;
  justificativa: string;
  prioridade: "baixa" | "media" | "alta";
}

export interface EncerramentoState {
  resumoFinal: string;
  liberadoCliente: boolean;
  exigirAprovacao: boolean;
  proximoPasso: string;
  dataProximaVisita?: string;
  // Campos integrados da Conduta para o mobile
  acaoRealizada?: string;
  orientacaoCliente?: string;
  recomendacaoPreliminar?: string;
  // Novos campos para monitoramento
  monitoramentoItens?: string[];
  monitoramentoFrequencia?: string;
  monitoramentoGatilhos?: string;
  // Campos para multi-OS
  osItens: EncerramentoOSItem[];
  osDataAplicacao?: string;
  osObservacoes?: string;
  // Campos para Agendar Retorno
  retornoMotivo?: string;
  retornoTurno: "manha" | "tarde" | "qualquer";
  retornoDuracaoMin: number;
  retornoLembreteDias: number;
  retornoObservacoes?: string;
  retornoNotificarProdutor: boolean;
  // Campos para Emitir Recomendação inline
  recItens?: EncerramentoRecItem[];
  recObservacoes?: string;
  recLiberarAutomaticamente?: boolean;
}

export const ENCERRAMENTO_DEFAULT: EncerramentoState = {
  resumoFinal: "",
  liberadoCliente: true,
  exigirAprovacao: true,
  proximoPasso: "emitir_recomendacao",
  dataProximaVisita: "",
  acaoRealizada: "",
  orientacaoCliente: "",
  recomendacaoPreliminar: "",
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
  recItens: [],
  recObservacoes: "",
  recLiberarAutomaticamente: false,
};

const OPCOES_ENCERRAMENTO = [
  {
    id: "emitir_recomendacao",
    label: "Emitir recomendação",
    description: "Casos que exigem aplicação imediata ou correção.",
    tooltip: "Registra a prescrição técnica para aprovação do produtor. Use quando o diagnóstico é claro mas a execução operacional (OS) será definida posteriormente.",
    icon: FileText,
    config: { liberadoCliente: true, exigirAprovacao: true, proximoPasso: "emitir_recomendacao" }
  },
  {
    id: "monitorar_area",
    label: "Apenas monitorar",
    description: "Registrar evolução na próxima visita.",
    tooltip: "Mantém a área sob observação contínua. Use quando não há necessidade de intervenção imediata, apenas acompanhamento de pragas/doenças.",
    icon: Gauge,
    config: { liberadoCliente: true, exigirAprovacao: false, proximoPasso: "monitorar_area" }
  },
  {
    id: "gerar_os",
    label: "Gerar OS imediata",
    description: "Encaminhar para execução operacional.",
    tooltip: "Abre a Ordem de Serviço operacional (produtos, doses e aplicação) vinculada à recomendação. Use para casos urgentes que já partem para execução.",
    icon: ClipboardList,
    config: { liberadoCliente: true, exigirAprovacao: true, proximoPasso: "gerar_os" }
  },
  {
    id: "programar_nova_visita",
    label: "Agendar retorno",
    description: "Reavaliar área em curto prazo.",
    tooltip: "Agenda uma nova visita técnica específica para esta área. Use para coletas de solo, avaliações pós-aplicação ou check-ups programados.",
    icon: Calendar,
    config: { liberadoCliente: false, exigirAprovacao: false, proximoPasso: "programar_nova_visita" }
  }
];

interface EncerramentoCardProps {
  value: EncerramentoState;
  onChange: (next: EncerramentoState) => void;
  checklist: ChecklistItem[];
  isFinalized: boolean;
  finalizando: boolean;
  onFinalize: () => void;
  onChecklistClick?: (item: ChecklistItem) => void;
  disabled?: boolean;
  registroStatus?: string | null;
  onEnviarAprovacao?: () => void;
  enviandoAprovacao?: boolean;
  isMobile?: boolean;
  pdfData?: VisitaPdfData | null;
}

export function EncerramentoCard({
  value,
  onChange,
  checklist,
  isFinalized,
  finalizando,
  onFinalize,
  onChecklistClick,
  disabled,
  registroStatus,
  onEnviarAprovacao,
  enviandoAprovacao,
  isMobile = false,
  pdfData,
}: EncerramentoCardProps) {
  const [editandoResumo, setEditandoResumo] = useState(false);
  const [mostrarConduta, setMostrarConduta] = useState(isMobile);

  const { data: produtos = [] } = useQuery({
    queryKey: ["ref-produtos-encerramento"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id, nome, dose_ml_ha").order("nome");
      return data || [];
    },
  });

  const { data: microrganismos = [] } = useQuery({
    queryKey: ["ref-microrganismos-encerramento"],
    queryFn: async () => {
      const { data } = await supabase
        .from("microrganismos")
        .select("id, nome, nome_cientifico, dose_ml_ha")
        .order("nome");
      return data || [];
    },
  });

  const handleOptionChange = (optionId: string) => {
    const opcao = OPCOES_ENCERRAMENTO.find(o => o.id === optionId);
    if (opcao) {
      let nextValue = {
        ...value,
        ...opcao.config
      };

      // Ao escolher Gerar OS, define data padrão mas NÃO cria item automático.
      // O usuário deve clicar em "Adicionar Produto" ou "Adicionar Microrganismo".
      if (optionId === "gerar_os") {
        if (!value.osItens) {
          nextValue.osItens = [];
        }
        if (!value.osDataAplicacao) {
          nextValue.osDataAplicacao = formatDateDisplay(new Date());
        }
      }

      onChange(nextValue);
    }
  };

  const addOSItem = () => {
    const next = [...(value.osItens || []), {
      tipo: "produto" as const,
      produtoId: "",
      doseMlHa: "",
      areaHa: "",
      modoAplicacao: "foliar"
    }];
    onChange({ ...value, osItens: next });
  };

  const addMicrorganismoItem = () => {
    const next = [...(value.osItens || []), {
      tipo: "microrganismo" as const,
      produtoId: "",
      microrganismoId: "",
      doseMlHa: "",
      areaHa: "",
      modoAplicacao: "foliar"
    }];
    onChange({ ...value, osItens: next });
  };

  const removeOSItem = (index: number) => {
    const next = (value.osItens || []).filter((_, i) => i !== index);
    onChange({ ...value, osItens: next });
  };

  const updateOSItem = (index: number, data: Partial<EncerramentoOSItem>) => {
    const next = [...(value.osItens || [])];
    const updatedItem = { ...next[index], ...data };

    // Se selecionou produto, tenta pegar dose default
    if (data.produtoId) {
      const prod = produtos.find(p => p.id === data.produtoId);
      if (prod && prod.dose_ml_ha) {
        updatedItem.doseMlHa = prod.dose_ml_ha.toString();
      }
    }

    // Se selecionou microrganismo, tenta pegar dose default
    if (data.microrganismoId) {
      const micro = microrganismos.find(m => m.id === data.microrganismoId);
      if (micro && (micro as any).dose_ml_ha) {
        updatedItem.doseMlHa = (micro as any).dose_ml_ha.toString();
      }
    }

    next[index] = updatedItem;
    onChange({ ...value, osItens: next });
  };

  const calculateVolumeTotal = (dose: string, area: string) => {
    const d = parseFloat(dose) || 0;
    const a = parseFloat(area) || 0;
    const vol = d * a;
    if (vol >= 1000) return `${(vol / 1000).toFixed(2)} L`;
    return `${vol.toFixed(0)} mL`;
  };

  // ---- Helpers: Recomendação inline ----
  const addRecItem = (tipo: "produto" | "microrganismo") => {
    const novoItem: EncerramentoRecItem = {
      tipo,
      produtoId: "",
      microrganismoId: "",
      doseMlHa: "",
      areaHa: "",
      modoAplicacao: "foliar",
      justificativa: "",
      prioridade: "media",
    };
    onChange({ ...value, recItens: [...(value.recItens || []), novoItem] });
  };

  const removeRecItem = (index: number) => {
    onChange({ ...value, recItens: (value.recItens || []).filter((_, i) => i !== index) });
  };

  const updateRecItem = (index: number, data: Partial<EncerramentoRecItem>) => {
    const next = [...(value.recItens || [])];
    const updated = { ...next[index], ...data };
    if (data.produtoId) {
      const prod = produtos.find(p => p.id === data.produtoId);
      if (prod && (prod as any).dose_ml_ha) {
        updated.doseMlHa = (prod as any).dose_ml_ha.toString();
      }
    }
    if (data.microrganismoId) {
      const micro = microrganismos.find(m => m.id === data.microrganismoId);
      if (micro && (micro as any).dose_ml_ha) {
        updated.doseMlHa = (micro as any).dose_ml_ha.toString();
      }
    }
    next[index] = updated;
    onChange({ ...value, recItens: next });
  };


  const dataObrigatoriaPendente = (value.proximoPasso === "programar_nova_visita" || value.proximoPasso === "monitorar_area") && !value.dataProximaVisita;
  const motivoRetornoPendente = value.proximoPasso === "programar_nova_visita" && !value.retornoMotivo;
  const duracaoPendente = value.proximoPasso === "programar_nova_visita" && !value.retornoDuracaoMin;
  const monitoramentoPendente = value.proximoPasso === "monitorar_area" && (!value.monitoramentoItens || value.monitoramentoItens.length === 0);
  const osPendente = value.proximoPasso === "gerar_os" && (
    !value.osDataAplicacao || 
    !value.osItens || 
    value.osItens.length === 0 || 
    value.osItens.some(i => {
      const semSelecao = (i.tipo === "microrganismo") ? !i.microrganismoId : !i.produtoId;
      return semSelecao || !i.doseMlHa || !i.areaHa;
    })
  );
  const recPendente = value.proximoPasso === "emitir_recomendacao" && (
    !value.recItens ||
    value.recItens.length === 0 ||
    value.recItens.some(i => {
      const semSelecao = i.tipo === "microrganismo" ? !i.microrganismoId : !i.produtoId;
      return semSelecao || !i.doseMlHa || !i.areaHa || !i.justificativa?.trim();
    })
  );
  
  const todosOk = checklist.every((c) => c.ok) && !dataObrigatoriaPendente && !motivoRetornoPendente && !duracaoPendente && !monitoramentoPendente && !osPendente && !recPendente;

  const toggleMonitorar = (item: string) => {
    const current = value.monitoramentoItens || [];
    const next = current.includes(item) 
      ? current.filter(i => i !== item) 
      : [...current, item];
    onChange({ ...value, monitoramentoItens: next });
  };

  const setFrequencia = (dias: string) => {
    const data = new Date();
    data.setDate(data.getDate() + parseInt(dias));
    onChange({ 
      ...value, 
      monitoramentoFrequencia: dias, 
      dataProximaVisita: formatDateDisplay(data) 
    });
  };

  return (
    <Card className="border-primary/20 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 bg-muted/30">
        <CardTitle className="text-base flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          {isMobile ? "Desfecho da Visita" : "Finalização da Visita"}
        </CardTitle>
      </CardHeader>
      <CardContent className={cn("p-4 space-y-6", isMobile && "p-3 space-y-4")}>
        
        {/* Bloco de Conduta Integrado (Apenas Mobile) */}
        {isMobile && (
          <div className="space-y-4 p-4 rounded-xl border-2 border-primary/10 bg-primary/5 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold text-primary">Conduta e Orientação</Label>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-[10px]"
                onClick={() => setMostrarConduta(!mostrarConduta)}
              >
                {mostrarConduta ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
            
            {mostrarConduta && (
              <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold">Orientação passada ao cliente</Label>
                  <Textarea
                    rows={2}
                    value={value.orientacaoCliente}
                    onChange={(e) => onChange({ ...value, orientacaoCliente: e.target.value })}
                    disabled={disabled}
                    placeholder="Resumo do que foi orientado em campo..."
                    className="text-sm bg-background border-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold">Recomendação preliminar</Label>
                  <Textarea
                    rows={2}
                    value={value.recomendacaoPreliminar}
                    onChange={(e) => onChange({ ...value, recomendacaoPreliminar: e.target.value })}
                    disabled={disabled}
                    placeholder="Conduta técnica recomendada inicialmente..."
                    className="text-sm bg-background border-primary/20"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">O que acontece agora?</Label>
          <RadioGroup
            value={value.proximoPasso}
            onValueChange={handleOptionChange}
            disabled={disabled}
            className={cn("grid grid-cols-1 gap-3", isMobile && "gap-2")}
          >
            {OPCOES_ENCERRAMENTO.map((opcao) => (
              <TooltipProvider key={opcao.id} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer hover:bg-accent/50 relative",
                        value.proximoPasso === opcao.id 
                          ? "border-primary bg-primary/5 shadow-inner" 
                          : "border-transparent bg-muted/40 opacity-70"
                      )}
                    >
                      <RadioGroupItem value={opcao.id} className="sr-only" />
                      <div className={cn(
                        "p-2 rounded-lg shrink-0",
                        value.proximoPasso === opcao.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <opcao.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 space-y-0.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm leading-tight truncate">{opcao.label}</p>
                          {opcao.tooltip && (
                            <div className="p-1 -m-1 touch-none">
                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">{opcao.description}</p>
                      </div>
                    </Label>
                  </TooltipTrigger>
                  {opcao.tooltip && (
                    <TooltipContent 
                      side={isMobile ? "top" : "right"} 
                      className="max-w-[250px] text-[11px] p-3 shadow-xl border-primary/10 select-none z-[100]"
                      sideOffset={5}
                    >
                      {opcao.tooltip}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ))}
          </RadioGroup>
        </div>

        {value.proximoPasso === "monitorar_area" && (
          <div className="space-y-4 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-emerald-600" />
              <Label className="text-sm font-semibold text-emerald-700">Plano de Monitoramento</Label>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">O que monitorar?</Label>
              <div className="flex flex-wrap gap-1.5">
                {["Pragas", "Doenças", "Plantas Daninhas", "Nutrição", "Clima", "Estande"].map((item) => (
                  <Button
                    key={item}
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMonitorar(item)}
                    className={cn(
                      "h-7 px-2 text-[10px] rounded-full transition-all",
                      value.monitoramentoItens?.includes(item)
                        ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                        : "bg-background border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    )}
                    disabled={disabled}
                  >
                    {item}
                  </Button>
                ))}
              </div>
              {(!value.monitoramentoItens || value.monitoramentoItens.length === 0) && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Selecione pelo menos um item
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Frequência</Label>
                <div className="flex gap-1">
                  {["7", "14", "30"].map((dias) => (
                    <Button
                      key={dias}
                      variant="outline"
                      size="sm"
                      onClick={() => setFrequencia(dias)}
                      className={cn(
                        "flex-1 h-8 text-[10px] px-1",
                        value.monitoramentoFrequencia === dias
                          ? "bg-emerald-100 border-emerald-400 text-emerald-800"
                          : "bg-background"
                      )}
                      disabled={disabled}
                    >
                      {dias}d
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Próxima Avaliação</Label>
                <Input
                  placeholder="DD/MM/YYYY"
                  value={value.dataProximaVisita || ""}
                  onChange={(e) => onChange({ ...value, dataProximaVisita: applyDateMask(e.target.value) })}
                  className="h-8 text-xs bg-background border-emerald-200"
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Gatilhos de Reavaliação Antecipada</Label>
              <Textarea
                rows={2}
                value={value.monitoramentoGatilhos}
                onChange={(e) => onChange({ ...value, monitoramentoGatilhos: e.target.value })}
                placeholder="Ex: Em caso de chuva superior a 20mm..."
                className="text-xs bg-background border-emerald-200"
                disabled={disabled}
              />
            </div>
          </div>
        )}

        {value.proximoPasso === "emitir_recomendacao" && (
          <div className="space-y-4 p-4 rounded-xl border-2 border-sky-200 bg-sky-50/50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-sky-600" />
                <Label className="text-sm font-semibold text-sky-700">Recomendação Técnica</Label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRecItem("produto")}
                  disabled={disabled}
                  className="h-7 text-[10px] border-sky-300 text-sky-700 hover:bg-sky-100"
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar Produto
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRecItem("microrganismo")}
                  disabled={disabled}
                  className="h-7 text-[10px] border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                >
                  <Beaker className="h-3 w-3 mr-1" /> Adicionar Microrganismo
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {(!value.recItens || value.recItens.length === 0) && (
                <div className="p-4 rounded-lg border border-dashed border-sky-300 bg-background/50 text-center">
                  <p className="text-xs text-sky-700">
                    Adicione pelo menos 1 item para emitir a recomendação técnica.
                  </p>
                </div>
              )}
              {value.recItens?.map((item, index) => {
                const isMicro = item.tipo === "microrganismo";
                return (
                  <div
                    key={index}
                    className={cn(
                      "p-3 rounded-lg border bg-background space-y-3 relative",
                      isMicro ? "border-emerald-200" : "border-sky-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-bold uppercase",
                          isMicro ? "text-emerald-700" : "text-sky-700"
                        )}>
                          Item #{index + 1}
                        </span>
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                          isMicro ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                        )}>
                          {isMicro ? "Microrganismo" : "Produto"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRecItem(index)}
                        disabled={disabled}
                        className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase font-bold">
                          {isMicro ? "Microrganismo" : "Produto Biológico"}
                        </Label>
                        {isMicro ? (
                          <Select
                            value={item.microrganismoId || ""}
                            onValueChange={(val) => updateRecItem(index, { microrganismoId: val })}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-8 text-xs bg-background border-emerald-100">
                              <SelectValue placeholder="Selecione o microrganismo" />
                            </SelectTrigger>
                            <SelectContent>
                              {microrganismos.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.nome}{m.nome_cientifico ? ` — ${m.nome_cientifico}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            value={item.produtoId || ""}
                            onValueChange={(val) => updateRecItem(index, { produtoId: val })}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-8 text-xs bg-background border-sky-100">
                              <SelectValue placeholder="Selecione o produto" />
                            </SelectTrigger>
                            <SelectContent>
                              {produtos.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Dose (mL/ha)</Label>
                          <Input
                            type="number"
                            value={item.doseMlHa}
                            onChange={(e) => updateRecItem(index, { doseMlHa: e.target.value })}
                            className="h-8 text-xs border-sky-100"
                            placeholder="0"
                            disabled={disabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Área (ha)</Label>
                          <Input
                            type="number"
                            value={item.areaHa}
                            onChange={(e) => updateRecItem(index, { areaHa: e.target.value })}
                            className="h-8 text-xs border-sky-100"
                            placeholder="0"
                            disabled={disabled}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Modo</Label>
                          <Select
                            value={item.modoAplicacao}
                            onValueChange={(val) => updateRecItem(index, { modoAplicacao: val })}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-8 text-xs bg-background border-sky-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="foliar">Foliar</SelectItem>
                              <SelectItem value="solo">Solo / Sulco</SelectItem>
                              <SelectItem value="fertirrigacao">Fertirrigação</SelectItem>
                              <SelectItem value="tratamento_semente">Tratamento de Semente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Prioridade</Label>
                          <Select
                            value={item.prioridade}
                            onValueChange={(val: any) => updateRecItem(index, { prioridade: val })}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-8 text-xs bg-background border-sky-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="baixa">Baixa</SelectItem>
                              <SelectItem value="media">Média</SelectItem>
                              <SelectItem value="alta">Alta</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase font-bold">
                          Justificativa Técnica <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          rows={2}
                          value={item.justificativa}
                          onChange={(e) => updateRecItem(index, { justificativa: e.target.value })}
                          placeholder="Ex: Alta incidência de lagarta — controle biológico recomendado..."
                          className="text-xs bg-background border-sky-100"
                          disabled={disabled}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-sky-200">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold text-sky-700">Observações Gerais da Recomendação</Label>
              <Textarea
                rows={2}
                value={value.recObservacoes || ""}
                onChange={(e) => onChange({ ...value, recObservacoes: e.target.value })}
                placeholder="Notas técnicas adicionais que se aplicam a todos os itens..."
                className="text-xs bg-background border-sky-200"
                disabled={disabled}
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-sky-200">
              <div className="flex items-center justify-between p-2.5 bg-sky-100/50 rounded-lg">
                <div className="flex flex-col">
                  <Label className="text-xs font-semibold text-sky-800">Exigir aprovação do supervisor</Label>
                  <span className="text-[10px] text-sky-700/80">Recomendação fica pendente até o supervisor aprovar.</span>
                </div>
                <Switch
                  checked={value.exigirAprovacao}
                  onCheckedChange={(val) => onChange({
                    ...value,
                    exigirAprovacao: val,
                    // se aprovação é exigida, não libera direto
                    recLiberarAutomaticamente: val ? false : (value.recLiberarAutomaticamente ?? true),
                  })}
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between p-2.5 bg-sky-100/30 rounded-lg">
                <div className="flex flex-col">
                  <Label className={cn("text-xs font-semibold", value.exigirAprovacao ? "text-muted-foreground" : "text-sky-800")}>
                    Liberar automaticamente ao produtor
                  </Label>
                  <span className="text-[10px] text-sky-700/80">
                    {value.exigirAprovacao ? "Só após aprovação do supervisor." : "Produtor recebe a recomendação na hora."}
                  </span>
                </div>
                <Switch
                  checked={!!value.recLiberarAutomaticamente && !value.exigirAprovacao}
                  onCheckedChange={(val) => onChange({ ...value, recLiberarAutomaticamente: val })}
                  disabled={disabled || value.exigirAprovacao}
                />
              </div>
            </div>
          </div>
        )}

        {value.proximoPasso === "gerar_os" && (
          <div className="space-y-4 p-4 rounded-xl border-2 border-amber-200 bg-amber-50/50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-amber-600" />
                <Label className="text-sm font-semibold text-amber-700">Pré-OS Multi-Produto</Label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={addOSItem}
                  disabled={disabled}
                  className="h-7 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar Produto
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={addMicrorganismoItem}
                  disabled={disabled}
                  className="h-7 text-[10px] border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                >
                  <Beaker className="h-3 w-3 mr-1" /> Adicionar Microrganismo
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {(!value.osItens || value.osItens.length === 0) && (
                <div className="p-4 rounded-lg border border-dashed border-amber-300 bg-background/50 text-center">
                  <p className="text-xs text-amber-700">
                    Nenhum item adicionado. Use <span className="font-semibold">Adicionar Produto</span> ou <span className="font-semibold">Adicionar Microrganismo</span> para iniciar a Pré-OS.
                  </p>
                </div>
              )}
              {value.osItens?.map((item, index) => {
                const isMicro = item.tipo === "microrganismo";
                return (
                <div
                  key={index}
                  className={cn(
                    "p-3 rounded-lg border bg-background space-y-3 relative group",
                    isMicro ? "border-emerald-200" : "border-amber-200"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold uppercase",
                        isMicro ? "text-emerald-700" : "text-amber-600"
                      )}>
                        Item #{index + 1}
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                        isMicro
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      )}>
                        {isMicro ? "Microrganismo" : "Produto"}
                      </span>
                    </div>
                    {value.osItens.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeOSItem(index)}
                        disabled={disabled}
                        className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">
                        {isMicro ? "Microrganismo" : "Produto Biológico"}
                      </Label>
                      {isMicro ? (
                        <Select
                          value={item.microrganismoId || ""}
                          onValueChange={(val) => updateOSItem(index, { microrganismoId: val })}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background border-emerald-100">
                            <SelectValue placeholder="Selecione o microrganismo" />
                          </SelectTrigger>
                          <SelectContent>
                            {microrganismos.map((m: any) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nome}
                                {m.nome_cientifico ? ` — ${m.nome_cientifico}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select 
                          value={item.produtoId} 
                          onValueChange={(val) => updateOSItem(index, { produtoId: val })}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background border-amber-100">
                            <SelectValue placeholder="Selecione o produto" />
                          </SelectTrigger>
                          <SelectContent>
                            {produtos.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Dose (mL/ha)</Label>
                        <Input
                          type="number"
                          value={item.doseMlHa}
                          onChange={(e) => updateOSItem(index, { doseMlHa: e.target.value })}
                          className="h-8 text-xs border-amber-100"
                          placeholder="0"
                          disabled={disabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Área (ha)</Label>
                        <Input
                          type="number"
                          value={item.areaHa}
                          onChange={(e) => updateOSItem(index, { areaHa: e.target.value })}
                          className="h-8 text-xs border-amber-100"
                          placeholder="0"
                          disabled={disabled}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Modo de Aplicação</Label>
                      <Select 
                        value={item.modoAplicacao} 
                        onValueChange={(val) => updateOSItem(index, { modoAplicacao: val })}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background border-amber-100">
                          <SelectValue placeholder="Modo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="foliar">Foliar</SelectItem>
                          <SelectItem value="solo">Solo / Sulco</SelectItem>
                          <SelectItem value="fertirrigacao">Fertirrigação</SelectItem>
                          <SelectItem value="tratamento_semente">Tratamento de Semente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center justify-between p-2 rounded bg-amber-100/50 border border-amber-200">
                      <Label className="text-[10px] text-amber-700 font-bold uppercase">Volume Total Estimado</Label>
                      <span className="text-xs font-mono font-bold text-amber-900">
                        {calculateVolumeTotal(item.doseMlHa, item.areaHa)}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-200">
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold text-amber-700">Data Desejada</Label>
                <Input
                  placeholder="DD/MM/YYYY"
                  value={value.osDataAplicacao || ""}
                  onChange={(e) => onChange({ ...value, osDataAplicacao: applyDateMask(e.target.value) })}
                  className="h-9 text-xs bg-background border-amber-300"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <p className="text-[10px] text-amber-600 font-medium bg-amber-100/50 p-2 rounded-lg leading-tight">
                  <Beaker className="h-3 w-3 inline mr-1" />
                  PCP automático será gerado para cada item após aprovação.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold text-amber-700">Observações Operacionais</Label>
              <Textarea
                rows={2}
                value={value.osObservacoes}
                onChange={(e) => onChange({ ...value, osObservacoes: e.target.value })}
                placeholder="Ex: Utilizar bico de baixa deriva..."
                className="text-xs bg-background border-amber-300"
                disabled={disabled}
              />
            </div>
          </div>
        )}

        {value.proximoPasso === "programar_nova_visita" && (
          <div className="space-y-4 p-4 rounded-xl border-2 border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-top-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold text-primary">Data do Retorno</Label>
                </div>
                <Input
                  placeholder="DD/MM/YYYY"
                  value={value.dataProximaVisita || ""}
                  onChange={(e) => onChange({ ...value, dataProximaVisita: applyDateMask(e.target.value) })}
                  className="bg-background border-primary/30 focus-visible:ring-primary h-10"
                  disabled={disabled}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold text-primary">Turno Preferencial</Label>
                </div>
                <Select 
                  value={value.retornoTurno} 
                  onValueChange={(val: any) => onChange({ ...value, retornoTurno: val })}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-background border-primary/30 h-10">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manha">Manhã</SelectItem>
                    <SelectItem value="tarde">Tarde</SelectItem>
                    <SelectItem value="qualquer">Qualquer horário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase font-bold text-primary">Motivo do Retorno</Label>
              <div className="flex flex-wrap gap-2">
                {["Reavaliação", "Conferência de Aplicação", "Coleta de Amostra", "Follow-up Cliente", "Outro"].map((motivo) => (
                  <Button
                    key={motivo}
                    variant="outline"
                    size="sm"
                    onClick={() => onChange({ ...value, retornoMotivo: motivo })}
                    className={cn(
                      "h-8 px-3 text-xs rounded-full transition-all",
                      value.retornoMotivo === motivo
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-primary/20 text-primary/70 hover:bg-primary/5"
                    )}
                    disabled={disabled}
                  >
                    {motivo}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase font-bold text-primary">Duração Estimada</Label>
                <Select 
                  value={value.retornoDuracaoMin.toString()} 
                  onValueChange={(val) => onChange({ ...value, retornoDuracaoMin: parseInt(val) })}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-background border-primary/30 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1h 30min</SelectItem>
                    <SelectItem value="120">2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase font-bold text-primary">Aviso Antecipado</Label>
                <Select 
                  value={value.retornoLembreteDias.toString()} 
                  onValueChange={(val) => onChange({ ...value, retornoLembreteDias: parseInt(val) })}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-background border-primary/30 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 dia antes</SelectItem>
                    <SelectItem value="3">3 dias antes</SelectItem>
                    <SelectItem value="7">1 semana antes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase font-bold text-primary">Observações para o Retorno</Label>
              <Textarea
                rows={2}
                value={value.retornoObservacoes}
                onChange={(e) => onChange({ ...value, retornoObservacoes: e.target.value })}
                placeholder="Ex: Trazer kit de coleta de solo..."
                className="text-sm bg-background border-primary/30"
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium text-primary">Notificar produtor pelo portal</Label>
              </div>
              <Switch 
                checked={value.retornoNotificarProdutor}
                onCheckedChange={(val) => onChange({ ...value, retornoNotificarProdutor: val })}
                disabled={disabled}
              />
            </div>
          </div>
        )}

        {!todosOk && (
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-destructive/5 border border-destructive/10 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 text-destructive text-[11px] font-bold uppercase tracking-wider">
              <AlertCircle className="h-3 w-3" />
              Pendências de Finalização
            </div>
            <ul className="text-[10px] text-destructive/80 space-y-0.5 list-disc pl-4">
              {dataObrigatoriaPendente && <li>Defina a data prevista para o retorno ou monitoramento.</li>}
              {motivoRetornoPendente && <li>Selecione o motivo principal do retorno técnico.</li>}
              {duracaoPendente && <li>Informe a duração estimada da visita de retorno.</li>}
              {monitoramentoPendente && <li>Selecione pelo menos um item para monitorar.</li>}
              {osPendente && <li>Preencha todos os campos obrigatórios dos itens da OS.</li>}
              {recPendente && <li>Adicione ao menos 1 item de recomendação com produto/microrganismo, dose, área e justificativa técnica.</li>}
              {!checklist.every(item => item.ok) && <li>Conclua todos os itens do checklist da visita.</li>}
            </ul>
          </div>
        )}

        <div className="space-y-4 pt-2">
          {/* Resumo unificado: síntese automática + ação da finalização */}
          <div className="p-3 bg-muted/40 border border-muted rounded-xl space-y-2 animate-in fade-in duration-500">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Resumo da Finalização</span>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex text-muted-foreground/60 hover:text-primary transition-colors cursor-help">
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px] text-[10px] p-2 leading-snug">
                      O resumo técnico será gerado automaticamente com base nos dados do diagnóstico e conduta ao finalizar.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] h-4 bg-background uppercase font-bold tracking-tighter">
                  {value.proximoPasso === "emitir_recomendacao" ? "Apenas Recomendação" :
                   value.proximoPasso === "gerar_os" ? "Recomendação + OS" :
                   value.proximoPasso === "monitorar_area" ? "Monitoramento" : "Retorno Técnico"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-primary"
                  onClick={() => setEditandoResumo(!editandoResumo)}
                >
                  {editandoResumo ? "Ver automático" : "Editar manual"}
                </Button>
              </div>
            </div>

            {!editandoResumo ? (
              <p className="text-xs text-foreground/80 leading-relaxed italic">
                {value.resumoFinal || "Aguardando geração automática..."}
              </p>
            ) : (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <Textarea
                  rows={3}
                  value={value.resumoFinal}
                  onChange={(e) => onChange({ ...value, resumoFinal: e.target.value })}
                  disabled={disabled}
                  placeholder="Síntese personalizada da vistoria..."
                  className="text-sm rounded-xl focus-visible:ring-primary"
                />
              </div>
            )}

            <p className="text-xs text-foreground/80 leading-relaxed italic">
              {value.proximoPasso === "emitir_recomendacao" && (
                value.exigirAprovacao
                  ? `Serão registrados ${value.recItens?.length || 0} item(ns) de recomendação. Status: enviado para aprovação do supervisor.`
                  : `Serão registrados ${value.recItens?.length || 0} item(ns) de recomendação${value.recLiberarAutomaticamente ? ", liberados imediatamente ao produtor" : ""}.`
              )}
              {value.proximoPasso === "gerar_os" && (
                `Será gerada uma Recomendação Técnica vinculada a uma Solicitação de OS com ${value.osItens?.length || 0} item(ns). Status: Aguardando Aprovação Técnica.`
              )}
              {value.proximoPasso === "monitorar_area" && (
                `A área entrará em regime de monitoramento frequente (cada ${value.monitoramentoFrequencia} dias).`
              )}
              {value.proximoPasso === "programar_nova_visita" && (
                `Visita de retorno agendada para ${value.dataProximaVisita ? formatDateDisplay(value.dataProximaVisita + "T12:00:00") : "uma data futura"}. Motivo: ${value.retornoMotivo || "não especificado"}.`
              )}
            </p>
          </div>


          {/* Checklist compacto no mobile se tudo OK */}
          {isMobile && todosOk ? (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-xs font-medium">
              <ClipboardCheck className="h-4 w-4" />
              Todos os requisitos da visita foram atendidos
            </div>
          ) : (
            <ChecklistFinalizacao items={checklist} onItemClick={onChecklistClick} />
          )}

          <div className="flex flex-col gap-2">
            {pdfData && (
              <PdfPreviewDialog 
                data={pdfData} 
                title="Pré-visualização da Visita"
                trigger={
                  <Button
                    variant="outline"
                    className="w-full border-dashed border-primary/30 text-primary hover:bg-primary/5 h-10 text-sm"
                    disabled={finalizando || isFinalized}
                  >
                    <FileSearch className="h-4 w-4 mr-2" />
                    Pré-visualizar PDF
                  </Button>
                }
              />
            )}
            <Button
              className={cn(
                "w-full h-12 text-base font-bold shadow-lg active:scale-[0.98] transition-transform",
                value.proximoPasso === "emitir_recomendacao" 
                  ? "bg-primary text-primary-foreground shadow-primary/20" 
                  : "bg-primary text-primary-foreground shadow-primary/20"
              )}
              onClick={onFinalize}
              disabled={disabled || finalizando || isFinalized || !todosOk}
            >
              {finalizando ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5 mr-2" />
              )}
              {isFinalized 
                ? "Visita Finalizada" 
                : value.proximoPasso === "emitir_recomendacao" 
                  ? "Finalizar e emitir recomendação" 
                  : "Finalizar Visita"
              }
            </Button>

            {isFinalized && value.proximoPasso === "monitorar_area" && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-3 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold">
                  <Gauge className="h-4 w-4" />
                  Plano de monitoramento ativado
                </div>
                <p className="text-[11px] text-emerald-600 leading-tight">
                  A área será acompanhada a cada {value.monitoramentoFrequencia} dias. A próxima avaliação está prevista para {value.dataProximaVisita ? formatDateDisplay(value.dataProximaVisita + "T12:00:00") : "—"}.
                </p>
                <Button 
                  className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  onClick={() => {
                    // Logic to schedule on technical agenda
                    toast.info("Agendando na agenda técnica...");
                  }}
                >
                  Agendar na minha agenda
                </Button>
              </div>
            )}

            {isFinalized && value.proximoPasso === "gerar_os" && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-3 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4" />
                  Solicitação de OS Multi-Produto enviada
                </div>
                <p className="text-[11px] text-amber-600 leading-tight">
                  Foram solicitados {value.osItens?.length} itens (produtos e/ou microrganismos) para aplicação em {value.osDataAplicacao ? formatDateDisplay(value.osDataAplicacao + "T12:00:00") : "—"}. Aguardando aprovação técnica para gerar as Ordens de Serviço.
                </p>
                <Button 
                  className="w-full h-9 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                  onClick={() => {
                    if (onEnviarAprovacao) {
                      onEnviarAprovacao();
                    } else {
                      window.location.href = "/fluxo-tecnico?tab=aprovacoes";
                    }
                  }}
                >
                  <Send className="h-3 w-3 mr-2" />
                  Acompanhar na Esteira
                </Button>
              </div>
            )}

            {isFinalized && value.proximoPasso === "programar_nova_visita" && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-3 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-blue-800 text-sm font-semibold">
                  <Calendar className="h-4 w-4" />
                  Retorno programado com sucesso
                </div>
                <p className="text-[11px] text-blue-600 leading-tight">
                  Sua próxima visita para {value.retornoMotivo} está agendada para {value.dataProximaVisita ? formatDateDisplay(value.dataProximaVisita + "T12:00:00") : "—"} ({value.retornoTurno}).
                </p>
                <div className="flex flex-col gap-2">
                  <Button 
                    variant="outline"
                    className="w-full h-9 border-blue-200 text-blue-700 hover:bg-blue-100 text-xs"
                    onClick={() => {
                      const eventDate = value.dataProximaVisita ? new Date(value.dataProximaVisita + (value.retornoTurno === 'manha' ? 'T08:00:00' : value.retornoTurno === 'tarde' ? 'T14:00:00' : 'T09:00:00')) : new Date();
                      import("@/lib/calendarIcs").then(({ generateIcs, downloadIcs }) => {
                        const ics = generateIcs({
                          title: `Retorno Técnico: ${value.retornoMotivo}`,
                          description: value.retornoObservacoes || `Retorno agendado via visita técnica anterior. Motivo: ${value.retornoMotivo}`,
                          start: eventDate,
                          durationMinutes: value.retornoDuracaoMin,
                          alarmDaysBefore: value.retornoLembreteDias
                        });
                        downloadIcs(`retorno-ar-bio-${value.dataProximaVisita}.ics`, ics);
                      });
                    }}
                  >
                    <Download className="h-3 w-3 mr-2" />
                    Adicionar ao Calendário (.ics)
                  </Button>
                  <Button 
                    className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    onClick={() => {
                      toast.info("Navegando para agenda técnica...");
                    }}
                  >
                    Ver na minha Agenda
                  </Button>
                </div>
              </div>
            )}

            {/* O segundo botão só aparece se não for mobile ou se já estiver finalizado e for outro fluxo */}
            {(!isMobile || (registroStatus === "finalizado" && value.proximoPasso !== "emitir_recomendacao" && value.proximoPasso !== "gerar_os")) && registroStatus === "finalizado" && onEnviarAprovacao && (
              <Button
                variant="outline"
                className="w-full h-12 border-primary text-primary hover:bg-primary/5 active:scale-[0.98] transition-transform"
                onClick={onEnviarAprovacao}
                disabled={enviandoAprovacao}
              >
                {enviandoAprovacao ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Send className="h-5 w-5 mr-2" />
                )}
                Enviar para Aprovação
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

