/**
 * Tela única "Visita Técnica de Campo" — responsiva, mobile-first.
 *
 * Unifica em uma rota o fluxo completo: cabeçalho com status, identificação,
 * check-in com GPS, diagnóstico, evidências (fotos/áudios/anexos/notas),
 * conduta, encerramento e timeline.
 *
 * Reutiliza:
 *  - mutações otimistas com rollback (status do registro)
 *  - StatusStepper, ChecklistFinalizacao, AudioRecorder, UploadQueuePanel
 *  - useMediaUploadQueue, generateVisitaPdf, EnviarPdfVisitaDialog
 *
 * Não cria migrations; conduta extra serializa em `observacoes_tecnicas` num
 * bloco "### Conduta" / "### Notas rápidas" para evitar mudança de schema.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useVisitaWorkspace } from "@/hooks/useVisitaWorkspace";
import { AcompanhamentoVisita } from "@/components/visita/AcompanhamentoVisita";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ClipboardCheck, Activity, Camera, Save, CheckCircle2, AlertTriangle, History,
  Loader2, FileDown, Mail, Clock, ClipboardList, MapPin, X, Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateDisplay, formatDateTimeDisplay, formatDateToISO, applyDateMask } from "@/lib/date-utils";
import { getEstagiosPorCultura } from "@/lib/fenologia";
import { useObjetivosVisita } from "@/hooks/useObjetivosVisita";


import { PageHeader } from "@/components/ResponsiveHelpers";
import { CheckinCard, CheckinObservacoes } from "@/components/visita/CheckinCard";
import { EvidenciasTabs } from "@/components/visita/EvidenciasTabs";
import { CondutaCard, CONDUTA_DEFAULT, type CondutaState } from "@/components/visita/CondutaCard";
import { EncerramentoCard, ENCERRAMENTO_DEFAULT, type EncerramentoState } from "@/components/visita/EncerramentoCard";
import { PlanoMonitoramentoEditor } from "@/components/visita/PlanoMonitoramentoEditor";
import { AprovacaoCard } from "@/components/visita/AprovacaoCard";
import { VisitaTimeline } from "@/components/visita/VisitaTimeline";
import { RoteiroVisita } from "@/components/visita/roteiro/RoteiroVisita";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { parseNotes, serializeNotes, type QuickNote } from "@/components/visita/NotasRapidas";
import { contarEvidencias } from "@/lib/visita/evidenciasCount";
import { EnviarPdfVisitaDialog } from "@/components/visita/EnviarPdfVisitaDialog";
import { VisitaStatusBanner } from "@/components/visita/VisitaStatusBanner";
import { generateVisitaPdf, sharePdf, type VisitaPdfData } from "@/lib/pdfVisita";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import {
  canTransition, getBlockReason, parseBackendTransitionError,
  showTransitionErrorToast, STATUS_LABEL_REGISTRO, nextRequiredStatus,
} from "@/lib/registroTransitions";
import type { ChecklistItem } from "@/components/visita/ChecklistFinalizacao";
import { ProblemaSelector } from "@/components/visita/ProblemaSelector";
import { gerarResumoEncerramento } from "@/lib/visitaResumo";
import { serializePlanoMonitoramento, parsePlanoMonitoramento, stripPlanoMonitoramento } from "@/lib/planoMonitoramento";
import { serializePlanoRetorno, parsePlanoRetorno, stripPlanoRetorno } from "@/lib/planoRetorno";
import { mensagemAmigavelVisita, codigoTecnicoVisita } from "@/lib/visita/visitaErrorMessages";
import { resolveVisitaAcoes } from "@/lib/visita/acoesPersistencia";
import { resolveEtapasAcionaveis, clampPercentualArea } from "@/lib/visita/etapasVisita";

// ---------- Helpers ----------
function translateError(msg: string): string {
  if (!msg) return "Erro desconhecido";
  
  // Erros de validação do trigger de retorno_tecnico
  if (msg.includes("Data prevista é obrigatória")) return "A data do retorno é obrigatória.";
  if (msg.includes("A data do retorno não pode ser no passado")) return "A data de retorno deve ser futura. Ajuste o campo no encerramento.";
  if (msg.includes("O motivo do retorno deve ser detalhado")) return "Selecione ou descreva um motivo válido para o retorno.";
  if (msg.includes("Um consultor deve estar atribuído")) return "Erro na atribuição do consultor. Tente salvar novamente.";
  if (msg.includes("Duração estimada é obrigatória")) return "Informe a duração estimada para o retorno técnico.";
  if (msg.includes("CONFLITO_AGENDA")) return "Conflito de agenda: Já existe uma visita ocupando este horário para o consultor.";

  const parsed = parseBackendTransitionError(msg);
  if (parsed) {
    const next = nextRequiredStatus(parsed.from);
    const fromLabel = STATUS_LABEL_REGISTRO[parsed.from] || parsed.from;
    if (next) return `Etapa atual: ${fromLabel} • Próxima etapa esperada: ${STATUS_LABEL_REGISTRO[next]}`;
    return `Etapa atual: ${fromLabel}. Transição não permitida.`;
  }
  if (msg.includes("problema principal")) return "Informe o problema principal antes de finalizar.";
  if (msg.includes("descrição técnica")) return "Preencha a descrição técnica antes de finalizar.";
  if (msg.includes("check_violation")) return "Dados inconsistentes. Verifique os campos obrigatórios.";

  // H9-GR: códigos técnicos das RPCs de visita nunca chegam crus à interface.
  const codigo = codigoTecnicoVisita(msg);
  if (codigo) return mensagemAmigavelVisita(msg);

  return `Erro: ${msg}`;
}

import { parseConduta, serializeConduta } from "@/lib/condutaSerializer";
import { formatOS } from "@/lib/osLabel";


// ---------- Page ----------
export default function VisitaTecnica() {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const workspaceQuery = useVisitaWorkspace(id ?? null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  const { config } = useSystemConfig();
  const { registrarTimeline } = useFluxoVisitaTecnica();

  const isNew = !id || id === "novo" || id === "nova";
  const solicitacaoIdParam = searchParams.get("solicitacao_id");
  const fromParam = searchParams.get("from");

  const inferredFrom = useMemo(() => {
    if (fromParam) return fromParam;
    if (typeof document === "undefined") return null;
    const ref = document.referrer || "";
    if (ref.includes("/solicitacoes")) return "solicitacoes";
    if (ref.includes("/app")) return "app";
    return null;
  }, [fromParam]);

  // Persistir o `from` inferido na URL para que refresh subsequentes mantenham
  // a origem correta (referrer fica vazio em refresh).
  useEffect(() => {
    if (fromParam === "consultor") {
      const next = new URLSearchParams(searchParams);
      next.delete("from");
      setSearchParams(next, { replace: true });
      return;
    }

    if (!fromParam && inferredFrom) {
      const next = new URLSearchParams(searchParams);
      next.set("from", inferredFrom);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inferredFrom, fromParam]);

  const effectiveFrom = fromParam || inferredFrom;

  const backTarget = useMemo(() => {
    switch (effectiveFrom) {
      case "solicitacoes":
        return { href: "/solicitacoes", label: "Solicitações" };
      case "app":
        return { href: "/app", label: "App" };
      default:
        return { href: "/visita-tecnica", label: "Visitas Técnicas" };
    }
  }, [effectiveFrom]);

  // Sempre confiar em `backTarget.href` quando a origem é conhecida — funciona
  // mesmo em refresh / nova aba (history vazio).
  const handleBack = () => {
    if (effectiveFrom) {
      navigate(backTarget.href);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(backTarget.href);
    }
  };

  // -------- Form state --------
  const [tipoVisita, setTipoVisita] = useState<string>("vistoria_inicial");
  const [objetivoVisita, setObjetivoVisita] = useState("");
  const [dataVisita, setDataVisita] = useState<string>(formatDateDisplay(new Date()));
  const [safra, setSafra] = useState("");
  const [faseFenologica, setFaseFenologica] = useState("");
  const [faseOutro, setFaseOutro] = useState(false);
  const [objetivoOutro, setObjetivoOutro] = useState(false);

  const [clienteId, setClienteId] = useState("");
  const [fazendaId, setFazendaId] = useState("");
  const [talhaoId, setTalhaoId] = useState("");
  const [culturaId, setCulturaId] = useState("");

  const [diagnosticos, setDiagnosticos] = useState<any[]>([
    {
      id: crypto.randomUUID(),
      problema: "",
      severidade: "medio",
      incidencia: "",
      descricao: "",
      categoria: "",
      localizacao: "",
    }
  ]);
  const [urgencia, setUrgencia] = useState<string>("media");
  const [necessidadeIntervencao, setNecessidadeIntervencao] = useState<string>("monitorar");
  const [riscoProdutivo, setRiscoProdutivo] = useState<string>("medio");
  
  // Helpers para compatibilidade legada e acesso rápido ao primeiro diagnóstico (opcional)
  const problemaPrincipal = diagnosticos[0]?.problema || "";
  const descricaoTecnica = diagnosticos[0]?.descricao || "";
  const nivelPressao = diagnosticos[0]?.severidade || "medio";
  const percentualAfetado = diagnosticos[0]?.incidencia || "";
  const categoriaProblema = diagnosticos[0]?.categoria || "";
  const localizacaoArea = diagnosticos[0]?.localizacao || "";
  const problemaSecundario = ""; // Unificado

  const [historicoResumido, setHistoricoResumido] = useState("");
  const [condicoesClimaticas, setCondicoesClimaticas] = useState("");

  const updateDiagnostico = (id: string, field: string, value: any) => {
    setDiagnosticos(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const addDiagnostico = () => {
    setDiagnosticos(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        problema: "",
        severidade: "medio",
        incidencia: "",
        descricao: "",
        categoria: "",
        localizacao: "",
      }
    ]);
  };

  const removeDiagnostico = (id: string) => {
    if (diagnosticos.length <= 1) return;
    setDiagnosticos(prev => prev.filter(d => d.id !== id));
  };

  const setProblemaPrincipal = (val: string) => updateDiagnostico(diagnosticos[0]?.id, 'problema', val);
  const setDescricaoTecnica = (val: string) => updateDiagnostico(diagnosticos[0]?.id, 'descricao', val);
  const setNivelPressao = (val: string) => updateDiagnostico(diagnosticos[0]?.id, 'severidade', val);
  const setPercentualAfetado = (val: string) => updateDiagnostico(diagnosticos[0]?.id, 'incidencia', val);
  const setCategoriaProblema = (val: string) => updateDiagnostico(diagnosticos[0]?.id, 'categoria', val);
  const setLocalizacaoArea = (val: string) => updateDiagnostico(diagnosticos[0]?.id, 'localizacao', val);
  const setProblemaSecundario = (val: string) => {}; // No-op para compatibilidade

  const [conduta, setConduta] = useState<CondutaState>(CONDUTA_DEFAULT);
  const [encerramento, setEncerramento] = useState<EncerramentoState>(ENCERRAMENTO_DEFAULT);
  const [notes, setNotes] = useState<QuickNote[]>([]);

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [enviarEmailOpen, setEnviarEmailOpen] = useState(false);
  const [confirmFinalizeNoPhotos, setConfirmFinalizeNoPhotos] = useState(false);
  const [activeStep, setActiveStep] = useState<string>("identificacao");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [uiMode, setUiMode] = useState<"editing" | "locked">("locked");

  const problemaRef = useRef<HTMLInputElement | null>(null);
  const descricaoRef = useRef<HTMLTextAreaElement | null>(null);
  const resumoRef = useRef<HTMLTextAreaElement | null>(null);
  /** Trava de uma finalização por vez (inclui a checagem assíncrona). */
  const finalizandoRef = useRef(false);

  // -------- Queries --------
  const { data: clientes = [] } = useQuery({
    queryKey: ["ref-clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id, nome, email").order("nome")).data || [],
  });
  const { data: allFazendas = [] } = useQuery({
    queryKey: ["ref-fazendas"],
    queryFn: async () => (await supabase.from("fazendas").select("id, nome, cliente_id").order("nome")).data || [],
  });
  const { data: allTalhoes = [] } = useQuery({
    queryKey: ["ref-talhoes"],
    queryFn: async () => (await supabase.from("talhoes").select("id, nome, fazenda_id, area_hectares, cultura_id, tipo_manejo_agua, latitude, longitude, localizacao_referencia").order("nome")).data || [],
  });
  const { data: culturas = [] } = useQuery({
    queryKey: ["ref-culturas"],
    queryFn: async () => (await supabase.from("culturas").select("id, nome").order("nome")).data || [],
  });

  const culturaNome = useMemo(
    () => (culturas as any[]).find((c) => c.id === culturaId)?.nome,
    [culturas, culturaId]
  );
  const estagiosFenologicos = useMemo(
    () => getEstagiosPorCultura(culturaNome),
    [culturaNome]
  );
  useEffect(() => {
    if (faseFenologica && estagiosFenologicos && !estagiosFenologicos.some((e) => e.codigo === faseFenologica)) {
      setFaseOutro(true);
    }
  }, [estagiosFenologicos, faseFenologica]);

  const { data: objetivosVisita = [] } = useObjetivosVisita(culturaId || null);
  useEffect(() => {
    if (objetivoVisita && objetivosVisita.length > 0 && !objetivosVisita.includes(objetivoVisita)) {
      setObjetivoOutro(true);
    }
  }, [objetivosVisita, objetivoVisita]);


  const fazendas = useMemo(
    () => (allFazendas as any[]).filter((f) => f.cliente_id === clienteId),
    [allFazendas, clienteId]
  );
  const talhoes = useMemo(
    () => (allTalhoes as any[]).filter((t) => t.fazenda_id === fazendaId),
    [allTalhoes, fazendaId]
  );

  const talhaoSelecionado = useMemo(
    () => (talhoes as any[]).find((t) => t.id === talhaoId),
    [talhoes, talhaoId]
  );

  const { data: visita, refetch: refetchVisita } = useQuery({
    queryKey: ["visita-tecnica", id],
    queryFn: async () => {
      if (isNew) return null;
      const { data, error } = await supabase
        .from("registros_consultor")
        .select(`*, clientes:cliente_id(nome, email), fazendas:fazenda_id(nome), talhoes:talhao_id(nome, tipo_manejo_agua), culturas:cultura_id(nome)`)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !isNew,
    refetchOnWindowFocus: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Garante que a entidade selecionada (vinda do registro salvo) sempre apareça nos
  // dropdowns do cabeçalho, mesmo quando RLS oculta a referência da listagem geral
  // ou enquanto as queries de referência ainda não resolveram.
  const mergeSelected = (
    list: Array<{ id: string; nome: string; [k: string]: any }>,
    selectedId: string | undefined | null,
    fallback: { nome?: string | null } | null | undefined,
    extra: Record<string, any> = {},
  ) => {
    if (!selectedId) return list;
    if (list.some((item) => item.id === selectedId)) return list;
    const nome = fallback?.nome || "(carregando…)";
    return [{ id: selectedId, nome, ...extra }, ...list];
  };

  const visitaRef: any = visita || {};
  const clientesOptions = useMemo(
    () => mergeSelected(clientes as any[], clienteId, visitaRef.clientes),
    [clientes, clienteId, visitaRef.clientes],
  );
  const fazendasOptionsAll = useMemo(
    () => mergeSelected(allFazendas as any[], fazendaId, visitaRef.fazendas, { cliente_id: clienteId }),
    [allFazendas, fazendaId, clienteId, visitaRef.fazendas],
  );
  const talhoesOptionsAll = useMemo(
    () => mergeSelected(allTalhoes as any[], talhaoId, visitaRef.talhoes, { fazenda_id: fazendaId }),
    [allTalhoes, talhaoId, fazendaId, visitaRef.talhoes],
  );
  const culturasOptions = useMemo(
    () => mergeSelected(culturas as any[], culturaId, visitaRef.culturas),
    [culturas, culturaId, visitaRef.culturas],
  );



  // Hidrata o form a partir do registro carregado
  const hydratedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visita) return;
    const v = visita as any;
    if (hydratedIdRef.current === v.id) return;
    hydratedIdRef.current = v.id;
    
    setTipoVisita(v.tipo_visita || "vistoria_inicial");
    setObjetivoVisita(v.objetivo_visita || "");
    setDataVisita(formatDateDisplay(v.data_vistoria || new Date()));
    setSafra(v.safra || "");
    setFaseFenologica(v.fase_fenologica || "");
    setClienteId(v.cliente_id || "");
    setFazendaId(v.fazenda_id || "");
    setTalhaoId(v.talhao_id || "");
    setCulturaId(v.cultura_id || "");

    // Carregar diagnósticos da nova tabela ou converter legados
    const loadDiagnostics = async () => {
      const { data: existingDiag } = await supabase
        .from("visita_diagnosticos")
        .select("*")
        .eq("registro_id", v.id)
        .order("created_at", { ascending: true });

      if (existingDiag && existingDiag.length > 0) {
        setDiagnosticos(existingDiag.map(d => ({
          id: d.id,
          problema: d.problema || "",
          severidade: d.severidade || "medio",
          incidencia: d.incidencia?.toString() || "",
          descricao: d.descricao || "",
          categoria: d.categoria || "",
          localizacao: d.localizacao || "",
        })));
      } else if (v.problema_principal) {
        setDiagnosticos([{
          id: crypto.randomUUID(),
          problema: v.problema_principal || "",
          severidade: v.nivel_pressao || "medio",
          incidencia: v.percentual_area_afetada?.toString() || "",
          descricao: "", 
          categoria: v.categoria_problema || "",
          localizacao: v.localizacao_na_area || "",
        }]);
      }
    };
    loadDiagnostics();

    setUrgencia(v.urgencia || "media");
    setNecessidadeIntervencao(v.necessidade_intervencao || "monitorar");
    setRiscoProdutivo(v.risco_produtivo || "medio");
    setHistoricoResumido(v.historico_resumido || "");
    setCondicoesClimaticas(v.condicoes_climaticas_observadas || "");
    
    setEncerramento(prev => ({
      ...prev,
      proximoPasso: v.proxima_acao_recomendada || "emitir_recomendacao",
      ...parsePlanoRetorno(v.observacoes_tecnicas),
      liberadoCliente: true,
      exigirAprovacao: false,
      dataProximaVisita: formatDateDisplay(v.data_proxima_visita) || "",
    }));
    // Decompor observacoes_tecnicas em conduta + notas + descrição técnica
    const obs = v.observacoes_tecnicas || "";
    const { notes: parsedNotes, clean: noNotes } = parseNotes(obs);
    const { conduta: parsedConduta, clean: cleanObs } = parseConduta(noNotes);
    setNotes(parsedNotes);
    if (parsedConduta) setConduta(parsedConduta);
  }, [visita]);

  const { data: arquivos = [] } = useQuery({
    queryKey: ["visita-arquivos", id],
    queryFn: async () => {
      if (isNew) return [];
      const { data } = await supabase
        .from("registros_consultor_arquivos")
        .select("*")
        .eq("registro_consultor_id", id)
        .order("uploaded_at", { ascending: false });
      return data || [];
    },
    enabled: !isNew,
  });

  const { data: checkins = [] } = useQuery({
    queryKey: ["visita-checkins", id],
    queryFn: async () => {
      if (isNew) return [];
      const { data } = await supabase
        .from("visitas_checkin")
        .select("id, latitude, longitude, precisao_gps, data_hora_checkin, tipo_checkin, foto_url, observacoes, justificativa_sem_gps")
        .eq("registro_consultor_id", id)
        .order("data_hora_checkin", { ascending: false });
      return data || [];
    },
    enabled: !isNew,
    refetchInterval: 300000,
  });

  // -------- Build payload --------
  const buildObservacoes = () => {
    const withConduta = serializeConduta(descricaoTecnica, conduta);
    return serializeNotes(withConduta, notes);
  };

  const getProximoPassoLabel = (val: string) => {
    const labels: Record<string, string> = {
      emitir_recomendacao: "Emitir recomendação",
      aguardar_retorno: "Aguardar retorno",
      gerar_os: "Gerar OS",
      monitorar_area: "Monitorar área",
      programar_nova_visita: "Agendar retorno",
      encerrar_atendimento: "Encerrar atendimento",
    };
    return labels[val] || val;
  };

  const buildPayload = (overrides: Record<string, any> = {}) => {
    // Se não há resumo manual, gera o automático com base no primeiro diagnóstico
    const resumoParaSalvar = encerramento.resumoFinal || gerarResumoEncerramento({
      tipo: tipoVisita,
      data: dataVisita,
      diagnostico: {
        problema: diagnosticos[0]?.problema,
        severidade: diagnosticos[0]?.severidade,
        incidencia: diagnosticos[0]?.incidencia ? Number(diagnosticos[0]?.incidencia) : undefined
      },
      conduta: conduta.acaoRealizada,
      proximoPassoLabel: getProximoPassoLabel(encerramento.proximoPasso),
      dataProximaVisita: encerramento.dataProximaVisita
    });

    // Derivação lógica para campos de retorno legados no CondutaState
    let necessidadeRetornoDerivada = conduta.necessidadeRetorno;
    let dataSugeridaDerivada = conduta.dataSugeridaRetorno;

    if (encerramento.proximoPasso === "programar_nova_visita") {
      necessidadeRetornoDerivada = "sim";
      dataSugeridaDerivada = encerramento.dataProximaVisita || "";
    } else if (encerramento.proximoPasso === "monitorar_area") {
      necessidadeRetornoDerivada = "avaliar_depois";
    } else {
      necessidadeRetornoDerivada = "nao";
    }

    const condutaAtualizada = {
      ...conduta,
      necessidadeRetorno: necessidadeRetornoDerivada,
      dataSugeridaRetorno: dataSugeridaDerivada,
    };

    let observacoesComMonitoramento = serializeConduta(descricaoTecnica, condutaAtualizada);
    if (encerramento.proximoPasso === "monitorar_area") {
      const cleanObs = stripPlanoMonitoramento(observacoesComMonitoramento);
      const monitoramentoBlock = serializePlanoMonitoramento(encerramento);
      observacoesComMonitoramento = `${cleanObs}\n\n${monitoramentoBlock}`.trim();
    } else if (encerramento.proximoPasso === "programar_nova_visita") {
      const cleanObs = stripPlanoRetorno(observacoesComMonitoramento);
      const retornoBlock = serializePlanoRetorno(encerramento);
      observacoesComMonitoramento = `${cleanObs}\n\n${retornoBlock}`.trim();
    }
    
    const safeParseNumber = (val: string) => {
      if (!val) return null;
      const parsed = Number(val.replace(',', '.'));
      return isNaN(parsed) ? null : parsed;
    };

    return {
      tipo_visita: tipoVisita,
      objetivo_visita: objetivoVisita || null,
      data_vistoria: formatDateToISO(dataVisita),
      safra: safra || null,
      fase_fenologica: faseFenologica || null,
      area_hectares: talhaoSelecionado?.area_hectares ?? null,
      cliente_id: clienteId || null,
      fazenda_id: fazendaId || null,
      talhao_id: talhaoId || null,
      cultura_id: culturaId || null,
      problema_principal: diagnosticos[0]?.problema || null,
      problema_secundario: null,
      categoria_problema: (diagnosticos[0]?.categoria || null) as any,
      nivel_pressao: (diagnosticos[0]?.severidade || "medio") as any,
      percentual_area_afetada: safeParseNumber(diagnosticos[0]?.incidencia),
      localizacao_na_area: diagnosticos[0]?.localizacao || null,
      historico_resumido: historicoResumido || null,
      condicoes_climaticas_observadas: condicoesClimaticas || null,
      // H9-G 2B: as notas rápidas vivem serializadas dentro de observacoes_tecnicas.
      // Elas PRECISAM entrar no payload, senão qualquer salvamento (inclusive o
      // que antecede a finalização) descarta silenciosamente as notas locais.
      observacoes_tecnicas:
        serializeNotes(
          serializeConduta(diagnosticos[0]?.descricao || "", condutaAtualizada),
          notes,
        ) || null,

      urgencia: urgencia as any,
      necessidade_intervencao: necessidadeIntervencao as any,
      risco_produtivo: riscoProdutivo as any,
      proxima_acao_recomendada: encerramento.proximoPasso || null,
      acao_realizada: conduta.acaoRealizada || null,
      
      data_proxima_visita: formatDateToISO(encerramento.dataProximaVisita) || null,
      client_uuid: (visita as any)?.client_uuid || crypto.randomUUID(),
      ...overrides,
    };
  };

  // -------- Save mutation (otimista) --------
  const saveMutation = useMutation({
    mutationFn: async ({ payload, finalizar }: { payload: any; finalizar: boolean }) => {
      if (!user) throw new Error("Sessão indisponível.");
      if (!isNew) {
        const current = await workspaceQuery.refetch();
        if (current.isError || !current.data?.permissions.can_edit ||
            !["rascunho", "em_andamento"].includes(current.data.status ?? "")) {
          throw new Error("Conteúdo da visita somente para leitura.");
        }
      }
      // Caminhos pós-finalização legados não possuem persistência atômica auditada.
      if (finalizar && ["gerar_os", "emitir_recomendacao", "programar_nova_visita"].includes(encerramento.proximoPasso)) {
        throw new Error("Este desfecho está indisponível nesta tela. Use a revisão técnica existente.");
      }
      let currentRegistroId = id;

      // H9-GR: a finalização NUNCA é gravada por UPDATE direto. O status só muda
      // pelo RPC seguro `rpc_finalizar_visita_v2`, que grava atomicamente
      // status + finalized_at + finalized_by + version + histórico.
      const { status: _statusIgnorado, ...payloadSemStatus } = (payload ?? {}) as any;
      const payloadPersistivel = payloadSemStatus;

      if (isNew) {
        const insertPayload = {
          ...payloadPersistivel,
          created_by: user.id,
          consultor_responsavel: user.id,
          consultor_profile_id: profile?.id || null,
          hora_inicio: new Date().toISOString(),
          status: "rascunho",
          solicitacao_id: solicitacaoIdParam,
        };
        const { data, error } = await supabase
          .from("registros_consultor")
          .insert(insertPayload)
          .select("id")
          .single();
        if (error) throw error;
        currentRegistroId = data.id;
      } else {
        const { data: saved, error } = await supabase
          .from("registros_consultor")
          .update(payloadPersistivel)
          .eq("id", id)
          .eq("version", workspaceQuery.data?.version)
          .select("id, version")
          .single();
        if (error) throw error;
        if (!saved) throw new Error("version_conflict");
      }

      // Salvar múltiplos diagnósticos
      if (currentRegistroId && currentRegistroId !== "nova" && currentRegistroId !== "novo") {
        // Deletar os atuais e inserir os novos (estratégia simples para rascunho/edição)
        const { error: deleteError } = await supabase.from("visita_diagnosticos").delete().eq("registro_id", currentRegistroId);
        if (deleteError) throw deleteError;
        
        const diagsToInsert = diagnosticos.map(d => ({
          registro_id: currentRegistroId,
          problema: d.problema,
          severidade: d.severidade,
          incidencia: Number(d.incidencia) || null,
          descricao: d.descricao,
          categoria: d.categoria,
          localizacao: d.localizacao,
        }));

        if (diagsToInsert.length > 0) {
          const { error: diagError } = await supabase.from("visita_diagnosticos").insert(diagsToInsert);
          if (diagError) throw diagError;
        }
      }

      // H9-GR: finalização atômica via RPC auditado (após persistir campos e diagnósticos).
      if (finalizar && currentRegistroId) {
        const { data: atual, error: versaoError } = await supabase
          .from("registros_consultor")
          .select("version")
          .eq("id", currentRegistroId)
          .single();
        if (versaoError) throw versaoError;

        const { data: finalized, error: finalizeError } = await supabase.rpc("rpc_finalizar_visita_v2" as any, {
          p_registro_id: currentRegistroId,
          p_expected_version: atual.version,
        } as any);
        if (finalizeError) throw finalizeError;
        const result = finalized as { id?: string; status?: string; version?: number; ok?: boolean; success?: boolean } | null;
        if (!result || result.ok === false || result.success === false || result.id !== currentRegistroId || result.status !== "finalizado" || !result.version) {
          throw new Error("Não foi possível confirmar a finalização.");
        }
      }

      if (!currentRegistroId) throw new Error("Visita não encontrada.");
      return { mode: isNew ? "insert" as const : "update" as const, id: currentRegistroId, finalizar };
    },
    onError: (err: any) => {
      toast.error(translateError(err?.message || "Erro ao salvar"));
      if (!isNew) refetchVisita();
    },
    onSuccess: async (result) => {
      // Nenhum efeito legado após fechamento do conteúdo: sem OS, writes filhas ou envios.
      await Promise.all([...["visita-tecnica", "visita-workspace", "visita-timeline", "visita-status-log"].map(
        key => queryClient.invalidateQueries({ queryKey: [key, result.id] })),
        ...["atendimentos-tecnicos", "atendimentos-tecnicos-resumo", "visitas"].map(
          key => queryClient.invalidateQueries({ queryKey: [key] }))]);
      if (result.mode === "insert") {
        toast.success(result.finalizar ? "Visita criada e finalizada" : "Rascunho criado");
        if (!result.finalizar) {
          setLastSavedAt(new Date());
          navigate(`/visita-tecnica/${result.id}`);
        } else {
          // Permanece na própria visita; recomendação foi gravada inline
          navigate(`/visita-tecnica/${result.id}`);
        }
      } else {
        if (!result.finalizar) {
          setLastSavedAt(new Date());
        } else {
          toast.success("Visita finalizada");
        }
        refetchVisita();
        queryClient.invalidateQueries({ queryKey: ["visita-timeline", id] });
      }
    },
  });


  // Envio/aprovação ficam na revisão existente via RPC; nenhum UPDATE de workflow aqui.

  // -------- Descartar rascunho --------
  const discardDraftMutation = useMutation({
    mutationFn: async () => {
      if (isNew || !id) return;
      if (registroStatus !== "rascunho") {
        throw new Error("Apenas rascunhos podem ser descartados.");
      }
      
      if (!workspaceQuery.data?.permissions.can_edit) throw new Error("Sem permissão para descartar.");
      const { data: deleted, error } = await supabase
        .from("registros_consultor")
        .delete()
        .eq("id", id)
        .eq("status", "rascunho")
        .select("id")
        .single();
      if (!deleted && !error) throw new Error("Não foi possível confirmar o descarte.");
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rascunho descartado com sucesso.");
      navigate(backTarget.href);
      queryClient.invalidateQueries({ queryKey: ["visitas-recentes"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao descartar rascunho: " + err.message);
    }
  });

  // -------- Autosave (debounced) --------
  useEffect(() => {
    if (isNew || !visita || !workspaceQuery.data?.permissions.can_edit || saveMutation.isPending) return;
    // Não autosalvar quando a visita já foi finalizada (mesmo em modo edição,
    // o salvamento deve ser explícito para registrar o motivo no histórico).
    if ((visita as any).status && (visita as any).status !== "rascunho") return;
    const t = setTimeout(() => {
      saveMutation.mutate({ payload: buildPayload(), finalizar: false });
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tipoVisita, objetivoVisita, dataVisita, safra, faseFenologica,
    problemaPrincipal, problemaSecundario, categoriaProblema, nivelPressao, percentualAfetado,
    localizacaoArea, historicoResumido, condicoesClimaticas, descricaoTecnica, urgencia,
    necessidadeIntervencao, riscoProdutivo, conduta, encerramento, notes,
  ]);

  /**
   * H9-G 2B — ação de salvar CANÔNICA e única.
   * O botão inferior ("Salvar"), o atalho Ctrl/Cmd+S e o botão do banner
   * ("Salvar alterações") chamam exatamente esta função. Ela decide o modo:
   *  - rascunho: salva o rascunho;
   *  - finalizada em edição: salva exigindo motivo e registra no histórico;
   *  - finalizada bloqueada: nada a salvar.
   * Cliques repetidos são ignorados enquanto houver salvamento em andamento.
   */
  const salvarCanonico = () => {
    if (saveMutation.isPending) return;
    if (!acoesVisita.canPersist) return;
    saveMutation.mutate({ payload: buildPayload(), finalizar: false });
  };

  const handleSaveDraft = salvarCanonico;


  // Atalho Ctrl/Cmd+S para salvar rascunho
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saveMutation.isPending && !isNew) handleSaveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, saveMutation.isPending]);

  const fotos = (arquivos as any[]).filter(
    (a) => a.tipo_midia === "foto" || (!a.tipo_midia && a.tipo_arquivo?.startsWith("image"))
  );

  const checkinExists = (checkins as any[]).length > 0;

  const checklist: ChecklistItem[] = [
    { id: "checkin", label: "Check-in realizado", ok: checkinExists, tab: "checkin" },
    { id: "problema", label: "Diagnóstico realizado", ok: diagnosticos.some(d => !!d.problema.trim()), tab: "diagnostico" },
    { id: "resumo", label: "Resumo final", ok: !!encerramento.proximoPasso, tab: "encerramento" },
  ];

  const handleChecklistClick = (item: ChecklistItem) => {
    if (item.tab) setActiveStep(item.tab);
    setTimeout(() => {
      if (item.id === "resumo") resumoRef.current?.focus();
    }, 150);
  };

  const registroStatus = workspaceQuery.data?.status ?? undefined;
  const isFinalized = !!registroStatus && !["rascunho", "em_andamento"].includes(registroStatus);
  const acoesVisita = resolveVisitaAcoes({
    isNew, status: registroStatus, uiMode,
    canEdit: isNew || (!workspaceQuery.isError && workspaceQuery.data?.permissions.can_edit === true),
  });
  const isReadOnly = acoesVisita.readOnly;

  /**
   * Máquina de etapas: define o que já pode ser acionado e qual é o PRIMEIRO
   * requisito bloqueante. Identificação e visita persistida vêm antes de
   * check-in, evidências, diagnóstico, PDF, envio e finalização.
   */
  const etapas = resolveEtapasAcionaveis({
    isNew,
    clienteId,
    fazendaId,
    talhaoId,
    dataVisita,
    temCheckin: checkinExists,
    diagnosticos,
    encerramento,
    isFinalized,
  });



  // Garante uiMode coerente quando o registro carrega/muda
  useEffect(() => {
    if (!registroStatus) return;
    if (["rascunho", "em_andamento"].includes(registroStatus)) setUiMode("editing");
    else setUiMode("locked");
  }, [registroStatus]);

  // Banner e barra inferior compartilham a MESMA ação canônica.
  const handleSaveEdit = salvarCanonico;


  const handleFinalize = async () => {
    // Um clique por vez: enquanto a checagem assíncrona de retorno duplicado
    // roda, novos cliques são ignorados (evita finalização duplicada).
    if (finalizandoRef.current || saveMutation.isPending || !acoesVisita.showFinalize) return;

    // ORDEM CANÔNICA: a mensagem sempre aponta o PRIMEIRO requisito bloqueante
    // (identificação → visita salva → check-in → diagnóstico → desfecho),
    // antes de qualquer consulta ao servidor.
    const bloqueio = etapas.bloqueio;
    if (bloqueio) {
      toast.error(bloqueio.mensagem);
      setActiveStep(bloqueio.etapa);
      setTimeout(() => {
        if (bloqueio.codigo === "DIAGNOSTICO_OBRIGATORIO") problemaRef.current?.focus();
        if (bloqueio.codigo === "DESCRICAO_OBRIGATORIA") descricaoRef.current?.focus();
      }, 120);
      return;
    }

    finalizandoRef.current = true;
    try {
      if (fotos.length === 0) {
        setConfirmFinalizeNoPhotos(true);
        return;
      }
      doFinalize();
    } catch (e: any) {
      // Recuperação visual: nada foi gravado, o usuário pode tentar de novo.
      toast.error(translateError(e?.message || "Não foi possível finalizar a visita."));
    } finally {
      finalizandoRef.current = false;
    }
  };

  const doFinalize = () => {
    // H9-G 2B: um único envio por vez. O payload já carrega TODAS as alterações
    // locais (inclusive notas rápidas); ele é persistido antes da RPC de
    // finalização e, se o salvamento falhar, a finalização não acontece.
    if (saveMutation.isPending) return;
    if (!acoesVisita.showFinalize) return;
    saveMutation.mutate({
      payload: buildPayload(),
      finalizar: true,
    });
  };


  // -------- PDF --------
  const { data: ordensConsolidado = [] } = useQuery({
    queryKey: ["os-consolidado-pdf", id],
    queryFn: async () => {
      if (isNew || !id) return [];
      const { data } = await supabase
        .from("ordens_servico_onfarm")
        .select("*, produtos(nome)")
        .eq("registro_consultor_id", id);
      return data || [];
    },
    enabled: !!id && !isNew,
  });

  const buildPdfData = (): VisitaPdfData | null => {
    if (!visita) return null;
    const v = visita as any;
    const audios = (arquivos as any[]).filter((a) => a.tipo_midia === "audio" || a.tipo_arquivo?.startsWith("audio"));
    const evidExtras = (arquivos as any[]).filter((a) =>
      ["laudo", "documento_cliente", "recomendacao_anexa"].includes(a.categoria_arquivo)
    );
    const checkin = (checkins as any[])[0];

    const osVinculadas = ordensConsolidado.map(os => ({
      numeroOs: formatOS(os as any),
      produto: (os as any).produtos?.nome || "—",
      dose: `${os.dose_ml_ha} mL/ha`,
      area: `${os.area_hectares} ha`,
      volumeTotal: `${os.volume_total_ml >= 1000 ? (os.volume_total_ml / 1000).toFixed(2) + ' L' : os.volume_total_ml.toFixed(0) + ' mL'}`,
      modoAplicacao: os.modo_aplicacao || "—",
      dataProgramada: os.data_recomendada ? formatDateDisplay(os.data_recomendada) : "—",
      status: os.status,
      // Se houver lógica de entrega futura, mapear aqui
      dataEntrega: os.status === 'entregue' ? 'Concluída' : 'Pendente' 
    }));

    return {
      empresa: { nome: config?.nome_empresa || "Cultivo Farm" },
      cliente: v.clientes?.nome,
      fazenda: v.fazendas?.nome,
      talhao: v.talhoes?.nome,
      tipoManejo: v.talhoes?.tipo_manejo_agua === 'irrigado' ? 'Irrigado' : 'Sequeiro',
      cultura: v.culturas?.nome,
      consultor: v.consultor_responsavel || "—",
      dataVisita: v.data_vistoria ? formatDateDisplay(v.data_vistoria) : "—",
      horaInicio: v.hora_inicio ? new Date(v.hora_inicio).toLocaleTimeString("pt-BR") : null,
      horaFim: v.hora_fim ? new Date(v.hora_fim).toLocaleTimeString("pt-BR") : null,
      status: v.status,
      checkin: checkin
        ? {
            latitude: checkin.latitude,
            longitude: checkin.longitude,
            precisao: checkin.precisao_gps,
            dataHora: checkin.data_hora_checkin ? formatDateTimeDisplay(checkin.data_hora_checkin) : null,
          }
        : null,
      coordenadasVistoria: v.latitude ? { latitude: Number(v.latitude), longitude: Number(v.longitude) } : null,
      problemaPrincipal: v.problema_principal,
      nivelPressao: v.nivel_pressao,
      percentualAfetado: v.percentual_area_afetada,
      riscoProdutivo: v.risco_produtivo,
      descricaoTecnica: descricaoTecnica,
      acaoRealizada: encerramento.acaoRealizada || conduta.acaoRealizada,
      orientacaoCliente: encerramento.orientacaoCliente || conduta.orientacaoCliente,
      proximaAcao: encerramento.proximoPasso,
      recomendacaoPreliminar: encerramento.recomendacaoPreliminar || conduta.recomendacaoPreliminar,
      fotos: fotos.map((f: any) => ({ url: f.arquivo_url, legenda: f.legenda })),
      audios: audios.map((a: any) => ({ url: a.arquivo_url, duracao: a.duracao_segundos, legenda: a.legenda })),
      evidenciasExtras: evidExtras.map((a: any) => ({
        url: a.arquivo_url,
        categoria: a.categoria_arquivo,
        legenda: a.legenda,
        data: a.capturado_em ? formatDateTimeDisplay(a.capturado_em) : null,
      })),
      osVinculadas
    };
  };

  const handleExportPdf = async () => {
    if (isNew || !visita) return;
    setGeneratingPdf(true);
    try {
      const data = buildPdfData();
      if (!data) return;
      const v = visita as any;
      const doc = await generateVisitaPdf(data);
      const fileName = `visita_${v.objetivo_visita || v.id.slice(0, 8)}.pdf`;
      const shared = await sharePdf(doc, fileName);
      if (!shared) {
        doc.save(fileName);
        toast.success("PDF gerado");
      } else {
        toast.success("PDF compartilhado");
      }
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + (err.message || ""));
    } finally {
      setGeneratingPdf(false);
    }
  };

  // -------- Side warnings --------
  const isUrgenciaCritica = urgencia === "critica";
  const isRiscoCritico = riscoProdutivo === "critico";

  useEffect(() => {
    if (isUrgenciaCritica) {
      toast.warning("Visita marcada como crítica — gestor será notificado.", { id: "urg-critica" });
    }
  }, [isUrgenciaCritica]);

  // ---------- RENDER ----------
  const numero = isNew ? "Nova" : `#${id?.slice(0, 8)}`;
  const v = visita as any;

  // Bloco de Identificação reutilizado nos dois layouts
  const identificacaoBlock = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Identificação do atendimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente <span className="text-destructive">*</span></Label>
            <Select disabled={isReadOnly} value={clienteId} onValueChange={(v) => { setClienteId(v); setFazendaId(""); setTalhaoId(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {clientesOptions.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fazenda <span className="text-destructive">*</span></Label>
            <Select value={fazendaId} onValueChange={(v) => { setFazendaId(v); setTalhaoId(""); }} disabled={isReadOnly || !clienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {fazendasOptionsAll
                  .filter((f: any) => !clienteId || f.cliente_id === clienteId || f.id === fazendaId)
                  .map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Talhão</Label>
            <Select value={talhaoId} onValueChange={setTalhaoId} disabled={isReadOnly || !fazendaId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {talhoesOptionsAll
                  .filter((t: any) => !fazendaId || t.fazenda_id === fazendaId || t.id === talhaoId)
                  .map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cultura</Label>
            <Select disabled={isReadOnly} value={culturaId} onValueChange={setCulturaId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {culturasOptions.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data da visita</Label>
            <Input disabled={isReadOnly} 
              placeholder="DD/MM/YYYY"
              value={dataVisita} 
              onChange={(e) => setDataVisita(applyDateMask(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2" key={`tipo-visita-${tipoVisita}`}>
            <Label className="text-xs">Tipo de visita</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { val: "vistoria_inicial", label: "Vistoria Inicial" },
                { val: "retorno", label: "Retorno" },
                { val: "monitoramento", label: "Monitoramento" },
                { val: "pos_aplicacao", label: "Pós-aplicação" },
                { val: "emergencia", label: "Emergência" },
                { val: "acompanhamento_programado", label: "Programada" },
              ].map((tipo) => (
                <Button
                  key={tipo.val}
                  disabled={isReadOnly}
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 text-[10px] sm:text-xs font-medium border transition-all",
                    tipoVisita === tipo.val 
                      ? "border-primary bg-primary/10 text-primary shadow-sm" 
                      : "hover:bg-accent/50"
                  )}
                  onClick={() => setTipoVisita(tipo.val)}
                >
                  {tipo.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Objetivo da visita</Label>
            {objetivosVisita.length > 0 ? (
              <>
                <Select disabled={isReadOnly}
                  value={
                    objetivoOutro
                      ? "__outro__"
                      : objetivosVisita.includes(objetivoVisita)
                        ? objetivoVisita
                        : ""
                  }
                  onValueChange={(v) => {
                    if (v === "__outro__") {
                      setObjetivoOutro(true);
                      setObjetivoVisita("");
                    } else {
                      setObjetivoOutro(false);
                      setObjetivoVisita(v);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o objetivo da visita" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {objetivosVisita.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                    <SelectItem value="__outro__">Outro / texto livre</SelectItem>
                  </SelectContent>
                </Select>
                {objetivoOutro && (
                  <Input disabled={isReadOnly}
                    value={objetivoVisita}
                    onChange={(e) => setObjetivoVisita(e.target.value)}
                    placeholder="Descreva o objetivo da visita"
                  />
                )}
              </>
            ) : (
              <Input disabled={isReadOnly}
                value={objetivoVisita}
                onChange={(e) => setObjetivoVisita(e.target.value)}
                placeholder="Ex: avaliar pressão de lagartas"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fase fenológica</Label>
            {estagiosFenologicos ? (
              <>
                <Select disabled={isReadOnly}
                  value={
                    faseOutro
                      ? "__outro__"
                      : estagiosFenologicos.some((e) => e.codigo === faseFenologica)
                        ? faseFenologica
                        : ""
                  }
                  onValueChange={(v) => {
                    if (v === "__outro__") {
                      setFaseOutro(true);
                      setFaseFenologica("");
                    } else {
                      setFaseOutro(false);
                      setFaseFenologica(v);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o estágio..." /></SelectTrigger>
                  <SelectContent>
                    {estagiosFenologicos.map((e) => (
                      <SelectItem key={e.codigo} value={e.codigo}>
                        {e.codigo} — {e.descricao}
                      </SelectItem>
                    ))}
                    <SelectItem value="__outro__">Outro / texto livre</SelectItem>
                  </SelectContent>
                </Select>
                {faseOutro && (
                  <Input disabled={isReadOnly}
                    value={faseFenologica}
                    onChange={(e) => setFaseFenologica(e.target.value)}
                    placeholder="Descreva o estágio"
                    className="mt-1"
                    autoFocus
                  />
                )}
              </>
            ) : (
              <Input disabled={isReadOnly}
                value={faseFenologica}
                onChange={(e) => setFaseFenologica(e.target.value)}
                placeholder={culturaId ? "Ex: V4, R2..." : "Selecione a cultura"}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Safra</Label>
            <Input disabled={isReadOnly} value={safra} onChange={(e) => setSafra(e.target.value)} placeholder="Ex: 2024/25" />
          </div>
        </div>
        {acoesVisita.showSave && (
          <div className="flex justify-end pt-3 mt-2 border-t">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saveMutation.isPending}
              className="h-9"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Salvar e continuar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const [checkinObs, setCheckinObs] = useState("");

  const checkinBlock = (
    <div className="space-y-3">
      {!isNew ? (
        <CheckinCard
          registroId={id!}
          disabled={isReadOnly}
          obs={checkinObs}
          onObsConsumed={() => setCheckinObs("")}
          checkins={checkins as any[]}
          solicitacaoId={(visita as any)?.solicitacao_id}
          talhaoCoords={
            talhaoSelecionado?.latitude != null && talhaoSelecionado?.longitude != null
              ? {
                  lat: Number(talhaoSelecionado.latitude),
                  lng: Number(talhaoSelecionado.longitude),
                  referencia: talhaoSelecionado.localizacao_referencia,
                }
              : null
          }
        />
      ) : (
        <Card><CardContent className="p-4 text-sm text-muted-foreground italic">
          Salve a visita primeiro para registrar check-in.
        </CardContent></Card>
      )}
      {!isNew && (
        <CheckinObservacoes
          value={checkinObs}
          onChange={setCheckinObs}
          disabled={isReadOnly}
        />
      )}
      {/* Botão de Diagnóstico para fluxo mobile */}
      {!isNew && !isReadOnly && activeStep === "checkin" && (
        <div className="flex justify-center pt-2">
          <Button 
            variant="outline" 
            className="w-full h-12 gap-2 border-primary/30 text-primary"
            onClick={() => setActiveStep("diagnostico")}
          >
            Avançar para Diagnóstico
            <Activity className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );

  const diagnosticoBlock = (
    <div className="space-y-4">
      {diagnosticos.map((diag, index) => (
        <Card key={diag.id} className="relative">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Diagnóstico {String(index + 1).padStart(2, '0')}</CardTitle>
            {diagnosticos.length > 1 && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive"
                onClick={() => removeDiagnostico(diag.id)}
                disabled={isReadOnly}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className={diag.problema.trim() ? "text-xs" : "text-xs text-destructive"}>
                Problema <span className="text-destructive">*</span>
              </Label>
              <fieldset disabled={isReadOnly}><ProblemaSelector
                value={diag.problema}
                onSelect={(p) => {
                  updateDiagnostico(diag.id, "problema", p.nome);
                  updateDiagnostico(diag.id, "categoria", p.categoria);
                }}
              /></fieldset>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="space-y-1.5 flex-1 min-w-0">
                <Label className="text-xs">Severidade / Pressão</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "baixo", label: "Baixa", color: "border-green-200 hover:bg-green-50 data-[state=on]:bg-green-100 data-[state=on]:text-green-700 data-[state=on]:border-green-500" },
                    { val: "medio", label: "Média", color: "border-amber-200 hover:bg-amber-50 data-[state=on]:bg-amber-100 data-[state=on]:text-amber-700 data-[state=on]:border-amber-500" },
                    { val: "alto", label: "Alta", color: "border-red-200 hover:bg-red-50 data-[state=on]:bg-red-100 data-[state=on]:text-red-700 data-[state=on]:border-red-500" },
                  ].map((lvl) => (
                    <Button
                      key={lvl.val}
                      type="button"
                      variant="outline"
                      className={cn("flex-1 h-12 text-sm font-bold border-2 transition-all shadow-sm active:scale-95", lvl.color)}
                      data-state={diag.severidade === lvl.val ? "on" : "off"}
                      onClick={() => {
                        updateDiagnostico(diag.id, "severidade", lvl.val);
                        if (index === 0) {
                          if (lvl.val === "baixo") {
                            setUrgencia("baixa");
                            setRiscoProdutivo("baixo");
                            setNecessidadeIntervencao("monitorar");
                          } else if (lvl.val === "medio") {
                            setUrgencia("media");
                            setRiscoProdutivo("medio");
                            setNecessidadeIntervencao("intervir_ate_7_dias");
                          } else {
                            setUrgencia("alta");
                            setRiscoProdutivo("alto");
                            setNecessidadeIntervencao("intervir_ate_3_dias");
                          }
                        }
                      }}
                      disabled={isReadOnly}
                    >
                      {lvl.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 w-32 shrink-0">
                <Label className="text-xs whitespace-nowrap">% da área afetada</Label>
                <div className="relative">
                  <Input
                    type="number" min="0" max="100"
                    className="pr-7 h-12 text-base font-mono-data"
                    value={diag.incidencia}
                    onChange={(e) => {
                      // Faixa canônica 0–100: o campo nunca guarda valor fora dela.
                      const val = clampPercentualArea(e.target.value);
                      updateDiagnostico(diag.id, "incidencia", val);
                      if (index === 0 && Number(val) > 50 && diag.severidade === "alto") {
                        setUrgencia("critica");
                        setNecessidadeIntervencao("intervir_imediatamente");
                        setRiscoProdutivo("critico");
                      }
                    }}
                    disabled={isReadOnly}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={diag.descricao.trim() ? "text-xs" : "text-xs text-destructive"}>
                Descrição técnica <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={4}
                value={diag.descricao}
                onChange={(e) => updateDiagnostico(diag.id, "descricao", e.target.value)}
                placeholder="Descreva sinais, sintomas e contexto observado..."
                disabled={isReadOnly}
              />
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="mais-detalhes" className="border-none">
                <AccordionTrigger className="text-xs font-medium text-muted-foreground hover:no-underline py-2">
                  Mais detalhes do diagnóstico
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Categoria</Label>
                      <Select 
                        value={diag.categoria} 
                        onValueChange={(v) => updateDiagnostico(diag.id, "categoria", v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="insetos_praga">Insetos / Pragas</SelectItem>
                          <SelectItem value="doencas_fungicas">Doenças Fúngicas</SelectItem>
                          <SelectItem value="doencas_bacterianas">Doenças Bacterianas</SelectItem>
                          <SelectItem value="nematoides">Nematoides</SelectItem>
                          <SelectItem value="plantas_daninhas">Plantas Daninhas</SelectItem>
                          <SelectItem value="desequilibrio_biologico_solo">Biológico / Solo</SelectItem>
                          <SelectItem value="baixa_vitalidade">Nutricional / Vigor</SelectItem>
                          <SelectItem value="fitotoxidade">Falha Operacional / Fito</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Localização do problema</Label>
                      <Input
                        value={diag.localizacao}
                        onChange={(e) => updateDiagnostico(diag.id, "localizacao", e.target.value)}
                        list={`loc-sugestoes-${diag.id}`}
                        placeholder="reboleira, bordadura..."
                        disabled={isReadOnly}
                      />
                      <datalist id={`loc-sugestoes-${diag.id}`}>
                        <option value="reboleira" />
                        <option value="bordadura" />
                        <option value="centro da área" />
                        <option value="área total" />
                        <option value="linhas isoladas" />
                        <option value="manchas distribuídas" />
                      </datalist>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-col gap-3">
        {!isReadOnly && (
          <Button 
            variant="outline" 
            className="w-full h-12 gap-2 border-dashed border-primary/50 text-primary font-bold hover:bg-primary/5"
            onClick={addDiagnostico}
          >
            <Camera className="h-4 w-4" />
            Nova evidência / diagnóstico
          </Button>
        )}

        {activeStep === "diagnostico" && (
          <div className="flex justify-center pt-4 border-t mt-4">
            <Button 
              variant="outline" 
              className="w-full h-12 gap-2 border-primary/30 text-primary font-bold"
              onClick={() => setActiveStep("evidencias")}
            >
              Avançar para Fotos/Anexos
              <Camera className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const evidenciasBlock = !isNew ? (
    <EvidenciasTabs
      registroId={id!}
      arquivos={arquivos as any[]}
      notes={notes}
      onNotesChange={setNotes}
      disabled={isReadOnly}
    />
  ) : (
    <Card><CardContent className="p-4 text-sm text-muted-foreground italic">
      Salve a visita primeiro para anexar fotos, áudios e arquivos.
    </CardContent></Card>
  );

  const condutaBlock = (
    <CondutaCard value={conduta} onChange={setConduta} disabled={isReadOnly} />
  );

  const encerramentoBlock = (
    <div className="space-y-3">
      <div className="pb-24 sm:pb-0">
        <EncerramentoCard
          value={encerramento}
          onChange={setEncerramento}
          checklist={checklist}
          isFinalized={isFinalized}
          disabled={isReadOnly}
          finalizando={saveMutation.isPending}
          onFinalize={handleFinalize}
          onChecklistClick={handleChecklistClick}
          onEnviarAprovacao={() => navigate("/fluxo-tecnico?tab=aprovacoes")}
        />
      </div>
      {/* Remover EnviarPdfVisitaDialog aqui, pois já existe em outro lugar ou foi mal posicionado */}

      {!isNew && id && (
        <>
          <AprovacaoCard registroId={id} registroStatus={(visita as any)?.status} />
          {/* Banner de status para OS Multi-Produto */}
          {(visita as any)?.status === "enviado_aprovacao" && encerramento.proximoPasso === "gerar_os" && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-800">OS Multi-Produto Pendente</p>
                  <p className="text-xs text-amber-700">Aguardando aprovação técnica para liberar PCP.</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-amber-300 text-amber-700 hover:bg-amber-100 h-8"
                  onClick={() => navigate("/fluxo-tecnico?tab=aprovacoes")}
                >
                  Acompanhar
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Lista de OS geradas para este registro */}
          {(visita as any)?.status === "convertido_os" && (
            <OSLoteAcompanhamento registroId={id} />
          )}
        </>
      )}
    </div>
  );

  // ---- Mobile bottom bar (atalhos rápidos) ----
  const fotoQuickInput = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 pb-24 lg:pb-6">
        <div className="sticky top-0 z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <PageHeader
          title={
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-muted-foreground font-mono text-sm">{numero}</span>
              <span className="break-words">{objetivoVisita || "Visita Técnica de Campo"}</span>
              {isRiscoCritico && (
                <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
                  Risco Crítico
                </span>
              )}
            </div>
          }
          description={[
            v?.clientes?.nome,
            v?.fazendas?.nome,
            v?.talhoes?.nome,
            dataVisita ? formatDateDisplay(dataVisita) : null
          ].filter(Boolean).join(" • ") || "Sem vínculos vinculados"}
          action={
            <div className="flex items-center gap-1.5 flex-wrap">
              {!isNew && registroStatus === "rascunho" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 sm:h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={discardDraftMutation.isPending}
                    >
                      {discardDraftMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline ml-1.5">Descartar</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Descartar rascunho?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação excluirá permanentemente este rascunho de visita técnica. Não será possível recuperar os dados.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => discardDraftMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Confirmar descarte
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {saveMutation.isPending && (
                <span className="text-[11px] text-muted-foreground hidden sm:inline-flex items-center gap-1 mr-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
                </span>
              )}
              {acoesVisita.showSave && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saveMutation.isPending}
                  className="h-8 sm:h-9"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline ml-1.5">Salvar</span>
                </Button>
              )}
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleExportPdf} 
                title={!etapas.podeGerarPdf ? "Disponível após finalizar a visita" : undefined}
                disabled={generatingPdf || !etapas.podeGerarPdf}
                className="h-8 sm:h-9"
              >
                {generatingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline ml-1.5">PDF</span>
              </Button>
              <Button 
                size="sm" 
                onClick={() => setEnviarEmailOpen(true)} 
                title={!etapas.podeEnviar ? "Disponível após finalizar a visita" : undefined}
                disabled={!etapas.podeEnviar}
                className="h-8 sm:h-9"
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1.5">Enviar</span>
              </Button>
            </div>
          }
        />
        </div>

        {/* Banner de status / edição de visita finalizada */}
        {!isNew && isFinalized && (
          <div className="mt-3">
            <VisitaStatusBanner
              registroId={id}
              status={registroStatus}
              proximoPasso={encerramento.proximoPasso}
              isEditing={false}
              canReopen={false}
              finalizedAt={(visita as any)?.hora_fim || (visita as any)?.updated_at}
              saving={saveMutation.isPending}
              onReopen={() => undefined}
              onSave={handleSaveEdit}
              onCancel={() => undefined}
              osExistenteId={(ordensConsolidado as any[])[0]?.id || null}
            />
          </div>
        )}

        {/* Banner: solicitação vinculada */}
        {solicitacaoIdParam && isNew && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Visita vinculada à solicitação <span className="font-mono">{solicitacaoIdParam.slice(0, 8)}</span>
          </div>
        )}

        {/* Mobile timeline trigger */}
        <div className="mt-3 lg:hidden flex justify-end">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-1.5" /> Ver histórico
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] sm:w-[420px] overflow-y-auto">
              {!isNew && id && <VisitaTimeline registroId={id} talhaoId={talhaoId} />}
            </SheetContent>
          </Sheet>
        </div>

        {/* Tabs: Edição vs Roteiro (roteiro só após finalizar) */}
        {!isNew && isFinalized && id ? (
          <Tabs
            value={["roteiro", "acompanhamento"].includes(searchParams.get("tab") || "")
              ? (searchParams.get("tab") as string)
              : "edicao"}
            onValueChange={(v) => {
              const next = new URLSearchParams(searchParams);
              if (v === "roteiro" || v === "acompanhamento") next.set("tab", v);
              else next.delete("tab");
              setSearchParams(next, { replace: true });
            }}
            className="mt-4"
          >
            <TabsList>
              <TabsTrigger value="edicao">Dados da visita</TabsTrigger>
              <TabsTrigger value="roteiro">Roteiro da visita</TabsTrigger>
              <TabsTrigger value="acompanhamento">Acompanhamento</TabsTrigger>
            </TabsList>
            <TabsContent value="edicao" className="mt-4">
              {/* Layout responsivo: grid no desktop, accordion no mobile/tablet */}
              <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
                {/* MOBILE / TABLET — Accordion */}
                <div className="lg:hidden space-y-3">
                  <Accordion type="single" collapsible defaultValue={activeStep} value={activeStep} onValueChange={setActiveStep}>
                    <AccordionItem value="identificacao">
                      <AccordionTrigger className="text-sm font-semibold">1 · Identificação</AccordionTrigger>
                      <AccordionContent>{identificacaoBlock}</AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="checkin">
                      <AccordionTrigger className="text-sm font-semibold">2 · Check-in {checkinExists && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-2" />}</AccordionTrigger>
                      <AccordionContent>{checkinBlock}</AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="diagnostico">
                      <AccordionTrigger className="text-sm font-semibold">3 · Diagnóstico {!diagnosticos.some(d => !!d.problema.trim()) && <AlertTriangle className="h-3.5 w-3.5 text-destructive ml-2" />}</AccordionTrigger>
                      <AccordionContent>{diagnosticoBlock}</AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="evidencias">
                      <AccordionTrigger className="text-sm font-semibold">4 · Evidências ({contarEvidencias(arquivos as any[], notes)})</AccordionTrigger>
                      <AccordionContent>{evidenciasBlock}</AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="monitoramento" className="border-none">
                      {isFinalized && necessidadeIntervencao === "monitorar" && id && (
                        <div className="px-1 py-3">
                          <PlanoMonitoramentoEditor readOnly={isReadOnly}
                            registroId={id}
                            observacoesAtuais={visita?.observacoes_tecnicas || ""}
                            dataProximaVisita={visita?.data_proxima_visita}
                            clienteId={clienteId}
                            fazendaId={fazendaId}
                            talhaoId={talhaoId}
                            consultorId={(visita as any)?.user_id || user?.id || ""}
                            onUpdate={() => refetchVisita()}
                          />
                        </div>
                      )}
                    </AccordionItem>
                    <AccordionItem value="encerramento">
                      <AccordionTrigger className="text-sm font-semibold">5 · Desfecho</AccordionTrigger>
                      <AccordionContent>{encerramentoBlock}</AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
                {/* DESKTOP — Stack vertical */}
                <div className="hidden lg:flex lg:flex-col lg:gap-4">
                  {identificacaoBlock}
                  {checkinBlock}
                  {diagnosticoBlock}
                  {evidenciasBlock}
                  {condutaBlock}
                  {isFinalized && necessidadeIntervencao === "monitorar" && id && (
                    <PlanoMonitoramentoEditor readOnly={isReadOnly}
                      registroId={id}
                      observacoesAtuais={visita?.observacoes_tecnicas || ""}
                      dataProximaVisita={visita?.data_proxima_visita}
                      clienteId={clienteId}
                      fazendaId={fazendaId}
                      talhaoId={talhaoId}
                      consultorId={(visita as any)?.user_id || user?.id || ""}
                      onUpdate={() => refetchVisita()}
                    />
                  )}
                  {encerramentoBlock}
                </div>
                {/* Timeline lateral (desktop) */}
                <aside className="hidden lg:block">
                  <div className="sticky top-[180px]">
                    <VisitaTimeline registroId={id} talhaoId={talhaoId} />
                  </div>
                </aside>
              </div>
            </TabsContent>
            <TabsContent value="roteiro" className="mt-4">
              <RoteiroVisita registroId={id} />
            </TabsContent>
            <TabsContent value="acompanhamento" className="mt-4">
              <AcompanhamentoVisita workspace={workspaceQuery.data} isLoading={workspaceQuery.isLoading} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="mt-4 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
            {/* MOBILE / TABLET — Accordion */}
            <div className="lg:hidden space-y-3">
              <Accordion type="single" collapsible defaultValue={activeStep} value={activeStep} onValueChange={setActiveStep}>
                <AccordionItem value="identificacao">
                  <AccordionTrigger className="text-sm font-semibold">1 · Identificação</AccordionTrigger>
                  <AccordionContent>{identificacaoBlock}</AccordionContent>
                </AccordionItem>
                <AccordionItem value="checkin">
                  <AccordionTrigger className="text-sm font-semibold">2 · Check-in {checkinExists && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-2" />}</AccordionTrigger>
                  <AccordionContent>{checkinBlock}</AccordionContent>
                </AccordionItem>
                <AccordionItem value="diagnostico">
                  <AccordionTrigger className="text-sm font-semibold">3 · Diagnóstico {!diagnosticos.some(d => !!d.problema.trim()) && <AlertTriangle className="h-3.5 w-3.5 text-destructive ml-2" />}</AccordionTrigger>
                  <AccordionContent>{diagnosticoBlock}</AccordionContent>
                </AccordionItem>
                <AccordionItem value="evidencias">
                  <AccordionTrigger className="text-sm font-semibold">4 · Evidências ({contarEvidencias(arquivos as any[], notes)})</AccordionTrigger>
                  <AccordionContent>{evidenciasBlock}</AccordionContent>
                </AccordionItem>
                <AccordionItem value="encerramento">
                  <AccordionTrigger className="text-sm font-semibold">5 · Desfecho</AccordionTrigger>
                  <AccordionContent>{encerramentoBlock}</AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            {/* DESKTOP — Stack vertical */}
            <div className="hidden lg:flex lg:flex-col lg:gap-4">
              {identificacaoBlock}
              {checkinBlock}
              {diagnosticoBlock}
              {evidenciasBlock}
              {condutaBlock}
              {encerramentoBlock}
            </div>
            {/* Timeline lateral (desktop) */}
            <aside className="hidden lg:block">
              <div className="sticky top-[180px]">
                {!isNew && id && <VisitaTimeline registroId={id} talhaoId={talhaoId} />}
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* Bottom bar fixa — mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur p-2 grid grid-cols-4 gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="flex-col h-12 gap-0.5 text-[10px]"
          onClick={() => fotoQuickInput.current?.click()}
          disabled={isNew || isReadOnly}
        >
          <Camera className="h-4 w-4" />
          Foto
        </Button>
        <input
          ref={fotoQuickInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length || isNew || !id) return;
            const queueItem = await import("@/lib/mediaUpload");
            for (const f of files) {
              await queueItem.uploadMediaIdempotent(
                {
                  clientUuid: crypto.randomUUID(),
                  file: f,
                  fileName: f.name,
                  mimeType: f.type,
                  kind: "foto",
                  categoria: "geral",
                },
                id
              );
            }
            queryClient.invalidateQueries({ queryKey: ["visita-arquivos", id] });
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="flex-col h-12 gap-0.5 text-[10px]"
          onClick={() => setActiveStep("evidencias")}
          disabled={isNew || isReadOnly}
        >
          <Activity className="h-4 w-4" /> Áudio
        </Button>
        {acoesVisita.showSave && (
          <Button
            variant="ghost"
            size="sm"
            className="flex-col h-12 gap-0.5 text-[10px]"
            onClick={handleSaveDraft}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        )}
        {acoesVisita.showFinalize && (
          <Button
            size="sm"
            className="flex-col h-12 gap-0.5 text-[10px]"
            onClick={handleFinalize}
            title={!etapas.finalizarAcionavel ? "Salve a visita antes de finalizar" : undefined}
            disabled={saveMutation.isPending || !etapas.finalizarAcionavel}
          >
            <CheckCircle2 className="h-4 w-4" />
            Finalizar
          </Button>
        )}
      </div>

      {/* AlertDialog: confirmar finalizar sem fotos */}
      <AlertDialog open={confirmFinalizeNoPhotos} onOpenChange={setConfirmFinalizeNoPhotos}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar sem evidências fotográficas?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta visita não possui fotos. Recomenda-se anexar pelo menos uma foto da área antes de concluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmFinalizeNoPhotos(false); doFinalize(); }}>
              Finalizar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de envio por e-mail */}
      {visita && !isNew && (
        <EnviarPdfVisitaDialog
          open={enviarEmailOpen}
          onOpenChange={setEnviarEmailOpen}
          visitaData={buildPdfData() || ({} as VisitaPdfData)}
          emailSugerido={(visita as any)?.clientes?.email ?? null}
          clienteNome={(visita as any)?.clientes?.nome ?? null}
          consultorEmail={user?.email ?? null}
          registroId={id}
          fileNameBase={`visita-${objetivoVisita || id?.slice(0, 8)}`}
        />
      )}
    </div>
  );
}

function OSLoteAcompanhamento({ registroId }: { registroId: string }) {
  const navigate = useNavigate();
  const { data: ordens = [] } = useQuery({
    queryKey: ["os-lote-registro", registroId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico_onfarm")
        .select("*, produtos(nome)")
        .eq("registro_consultor_id", registroId);
      return data || [];
    }
  });

  if (ordens.length === 0) return null;

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Ordens de Serviço Geradas
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-2">
        <div className="space-y-2">
          {ordens.map((os) => (
            <div key={os.id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-indigo-100 text-xs">
              <div className="flex flex-col">
                <span className="font-bold text-indigo-700">{(os as any).produtos?.nome || "Produto"}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{os.status}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[10px] text-indigo-600 hover:bg-indigo-50"
                onClick={() => navigate(`/fluxo-tecnico?tab=os-onfarm&os=${os.id}`)}
              >
                Abrir OS
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
