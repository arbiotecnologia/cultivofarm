import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useObjetivosVisita } from "@/hooks/useObjetivosVisita";
import { useVisitaWorkspace, EMPTY_VISITA_PERMISSIONS, visitaWorkspaceKey, TECHNICAL_STALE_REVALIDATION, useTechnicalQuerySession } from "@/hooks/useVisitaWorkspace";
import { wizardUnlockedUpTo } from "@/lib/visita/wizardProgress";
import { deriveVisitaWizardState } from "@/lib/visita/wizardWorkspaceState";
import { STATUS_LABEL_REGISTRO, type RegistroStatus } from "@/lib/registroTransitions";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  ChevronRight,
  Lock,
  Check,
  Loader2,
  WifiOff,
  AlertCircle,
  CircleDashed,
} from "lucide-react";
import { toast } from "sonner";
import {
  savePendingRegistro,
  getPendingRegistroById,
  updatePendingRegistro,
  getSyncedVisitMapping,
  saveSyncedVisitMapping,
} from "@/lib/offlineDb";
import {
  TECHNICAL_VISIT_SYNCED_EVENT,
  type TechnicalVisitSyncedDetail,
} from "@/lib/visitaSyncEvents";
import type { Database } from "@/integrations/supabase/cultivofarm.types";
import WizardCheckinStep from "./wizard/WizardCheckinStep";
import WizardCampoStep from "./wizard/WizardCampoStep";
import WizardDiagnosticoStep from "./wizard/WizardDiagnosticoStep";
import WizardRecomendacaoStep from "./wizard/WizardRecomendacaoStep";
import WizardAnexosStep from "./wizard/WizardAnexosStep";
import WizardRevisaoStep from "./wizard/WizardRevisaoStep";
import { AcompanhamentoVisita } from "@/components/visita/AcompanhamentoVisita";

/**
 * Wizard mobile de visita técnica — 7 etapas funcionais.
 *
 * - rotas oficiais /app/visita/novo e /app/visita/:id;
 * - etapas: identificação, check-in, campo, diagnóstico, recomendação,
 *   anexos e revisão/finalização;
 * - criação idempotente via rpc_criar_visita_idempotente (client_uuid);
 * - permissões e bloqueio (locked) vêm do workspace autoritativo do servidor
 *   (rpc_get_visita_workspace / useVisitaWorkspace);
 * - offline: salva rascunho local via offlineDb; não permite finalizar offline.
 */

type TipoVisita = Database["public"]["Enums"]["tipo_visita"];

const STEPS = [
  { id: 1, label: "Identificação" },
  { id: 2, label: "Check-in" },
  { id: 3, label: "Campo" },
  { id: 4, label: "Diagnóstico" },
  { id: 5, label: "Recomendação" },
  { id: 6, label: "Anexos" },
  { id: 7, label: "Revisão" },
  { id: 8, label: "Acompanhamento" },
] as const;

const TIPOS: { value: TipoVisita; label: string }[] = [
  { value: "vistoria_inicial", label: "Vistoria inicial" },
  { value: "retorno", label: "Retorno" },
  { value: "monitoramento", label: "Monitoramento" },
  { value: "pos_aplicacao", label: "Pós-aplicação" },
  { value: "emergencia", label: "Emergência" },
  { value: "acompanhamento_programado", label: "Acompanhamento programado" },
];

type SaveState = "idle" | "saving" | "saved" | "pending_sync" | "error";

function SaveStatus({ state }: { state: SaveState }) {
  const map: Record<SaveState, { icon: React.ReactNode; label: string; cls: string }> = {
    idle: { icon: <CircleDashed className="h-3.5 w-3.5" />, label: "Sem envio pendente", cls: "text-muted-foreground" },
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Salvando…", cls: "text-muted-foreground" },
    saved: { icon: <Check className="h-3.5 w-3.5" />, label: "Salvo", cls: "text-emerald-600" },
    pending_sync: { icon: <WifiOff className="h-3.5 w-3.5" />, label: "Pendente de sincronização", cls: "text-amber-600" },
    error: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Erro ao salvar", cls: "text-destructive" },
  };
  const m = map[state];
  return (
    <div className={`flex items-center gap-1 text-xs ${m.cls}`}>
      {m.icon}
      <span>{m.label}</span>
    </div>
  );
}

function StepIndicator({
  current, unlockedUpTo, onGo,
}: { current: number; unlockedUpTo: number; onGo: (id: number) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((s) => {
        const active = s.id === current;
        const unlocked = s.id <= unlockedUpTo;
        return (
          <button
            key={s.id}
            type="button"
            disabled={!unlocked}
            onClick={() => unlocked && onGo(s.id)}
            className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : unlocked
                  ? "bg-muted text-foreground border-transparent hover:bg-muted/70"
                  : "bg-muted/40 text-muted-foreground border-transparent cursor-not-allowed"
            }`}
          >
            <span className="font-medium">{s.id}</span>
            {!unlocked && <Lock className="h-3 w-3" />}
            <span className="hidden xs:inline">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface RpcResponse {
  ok: boolean;
  created?: boolean;
  registro_id?: string;
  client_uuid?: string;
  status?: string;
  version?: number;
  pdf_status?: string;
  error?: string;
}

const ERROR_LABELS: Record<string, string> = {
  unauthenticated: "Sessão expirada. Faça login novamente.",
  technical_access_required: "Você não tem vínculo ativo com este produtor.",
  producer_access_denied: "Acesso negado.",
  invalid_farm: "Fazenda inválida para este produtor.",
  invalid_plot: "Talhão inválido para esta fazenda.",
  invalid_crop: "Cultura inválida.",
  invalid_request: "Dados obrigatórios ausentes.",
  idempotency_conflict: "Este rascunho já foi criado por outro usuário.",
};

export default function MobileVisitaWizard() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const isNew = !id || id === "novo";
  const registroId = isNew ? null : (id as string);
  const localIdParam = searchParams.get("local_id");
  const registroSession = useTechnicalQuerySession("mobile-wizard-registro");
  const formIdentity = `${registroSession.scope}:${registroId ?? localIdParam ?? "novo"}`;
  const formHydration = useRef({ identity: formIdentity, hydrated: false, dirty: false });
  if (formHydration.current.identity !== formIdentity) {
    formHydration.current = { identity: formIdentity, hydrated: false, dirty: false };
  }

  // Estado da Etapa 1
  const [clienteId, setClienteId] = useState("");
  const [fazendaId, setFazendaId] = useState("");
  const [talhaoId, setTalhaoId] = useState("");
  const [culturaId, setCulturaId] = useState("");
  const [dataVistoria, setDataVistoria] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipoVisita, setTipoVisita] = useState<TipoVisita>("vistoria_inicial");
  const [objetivo, setObjetivo] = useState("");
  const [safra, setSafra] = useState("");
  const [faseFenologica, setFaseFenologica] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [currentStep, setCurrentStep] = useState(1);
  const [restoredFromLocal, setRestoredFromLocal] = useState(false);

  // Resolução do local_id: pending → mapping → RPC fallback → erro
  type LocalResolution =
    | { state: "idle" }
    | { state: "resolving" }
    | { state: "restored_pending" }
    | { state: "not_found" }
    | { state: "resolve_error"; message?: string };
  const [localRes, setLocalRes] = useState<LocalResolution>(
    localIdParam ? { state: "resolving" } : { state: "idle" }
  );

  // client_uuid **estável** — gerado uma única vez por rascunho, persistido
  // no IndexedDB e restaurado por local_id em refresh/retry.
  const clientUuidRef = useRef<string>(localIdParam || crypto.randomUUID());

  const solicitacaoId = searchParams.get("solicitacao");
  const { data: objetivos } = useObjetivosVisita(culturaId || null);

  // Resolução do rascunho local por local_id
  useEffect(() => {
    if (!localIdParam || restoredFromLocal) return;
    let cancelled = false;
    (async () => {
      try {
        const pending = await getPendingRegistroById(localIdParam);
        if (cancelled) return;
        if (pending) {
          clientUuidRef.current = pending.clientUuid || localIdParam;
          const p = pending.payload || {};
          setClienteId(p.p_cliente_id ?? "");
          setFazendaId(p.p_fazenda_id ?? "");
          setTalhaoId(p.p_talhao_id ?? "");
          setCulturaId(p.p_cultura_id ?? "");
          setDataVistoria(p.p_data_vistoria ?? new Date().toISOString().slice(0, 10));
          setTipoVisita((p.p_tipo_visita as TipoVisita) ?? "vistoria_inicial");
          setObjetivo(p.p_objetivo_visita ?? "");
          setSafra(p.p_safra ?? "");
          setFaseFenologica(p.p_fase_fenologica ?? "");
          setRestoredFromLocal(true);
          setSaveState("pending_sync");
          setLocalRes({ state: "restored_pending" });
          return;
        }

        const mapping = await getSyncedVisitMapping(localIdParam);
        if (cancelled) return;
        if (mapping?.remoteId) {
          navigate(
            `/app/visita/${mapping.remoteId}${solicitacaoId ? `?solicitacao=${solicitacaoId}` : ""}`,
            { replace: true }
          );
          return;
        }

        try {
          const { data, error } = await supabase.rpc(
            "rpc_get_my_visit_by_client_uuid" as never,
            { p_client_uuid: localIdParam } as never,
          );
          if (cancelled) return;
          const res = data as any;
          if (!error && res?.ok && res?.registro_id) {
            await saveSyncedVisitMapping({
              localId: localIdParam,
              clientUuid: localIdParam,
              remoteId: res.registro_id,
              version: res.version ?? null,
              syncedAt: Date.now(),
            });
            navigate(
              `/app/visita/${res.registro_id}${solicitacaoId ? `?solicitacao=${solicitacaoId}` : ""}`,
              { replace: true }
            );
            return;
          }
        } catch {
          /* segue para not_found */
        }

        setLocalRes({ state: "not_found" });
      } catch (e: any) {
        if (cancelled) return;
        setLocalRes({ state: "resolve_error", message: e?.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localIdParam, restoredFromLocal, navigate, solicitacaoId]);

  // Redireciona em tempo real quando a sincronização concluir para este local_id
  useEffect(() => {
    if (!localIdParam) return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<TechnicalVisitSyncedDetail>).detail;
      if (!detail || detail.localId !== localIdParam) return;
      setSaveState("saved");
      navigate(
        `/app/visita/${detail.remoteId}${solicitacaoId ? `?solicitacao=${solicitacaoId}` : ""}`,
        { replace: true }
      );
    };
    window.addEventListener(TECHNICAL_VISIT_SYNCED_EVENT, handler);
    return () => window.removeEventListener(TECHNICAL_VISIT_SYNCED_EVENT, handler);
  }, [localIdParam, navigate, solicitacaoId]);

  // Carrega registro existente (modo edição)
  const {
    data: registro,
    isLoading: loadingRegistro,
    error: registroError,
  } = useQuery({
    queryKey: ["mobile-wizard-registro", registroId, registroSession.scope],
    enabled: !!registroId && registroSession.ready,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async ({ signal }) => {
      if (!registroId) throw new Error("missing_visit");
      const assertCurrent = registroSession.fence();
      assertCurrent(signal);
      const { data, error } = await supabase
        .from("registros_consultor")
        .select("*")
        .eq("id", registroId)
        .maybeSingle().abortSignal(signal);
      assertCurrent(signal);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    // Background status refresh must never replace the mounted form or a pending save.
    if (!registroSession.ready || !registro || formHydration.current.hydrated ||
      formHydration.current.dirty || saveState === "saving" || saveState === "pending_sync") return;
    formHydration.current.hydrated = true;
    setClienteId(registro.cliente_id ?? "");
    setFazendaId(registro.fazenda_id ?? "");
    setTalhaoId(registro.talhao_id ?? "");
    setCulturaId(registro.cultura_id ?? "");
    setDataVistoria(registro.data_vistoria ?? new Date().toISOString().slice(0, 10));
    setTipoVisita((registro.tipo_visita as TipoVisita) ?? "vistoria_inicial");
    setObjetivo(registro.objetivo_visita ?? "");
    setSafra(registro.safra ?? "");
    setFaseFenologica(registro.fase_fenologica ?? "");
  }, [registro, registroSession.ready, formIdentity, saveState]);

  // Permissões efetivas vêm do servidor (rpc_get_visita_workspace).
  // Nunca derivar permissão apenas do status local, e nunca afirmar "concluída"
  // apenas porque o workspace está ausente (carregando/erro/negado são estados
  // distintos — ver src/lib/visita/wizardWorkspaceState.ts).
  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
    refetch: refetchWorkspace,
  } = useVisitaWorkspace(registroId);
  const permissions = workspace?.permissions ?? EMPTY_VISITA_PERMISSIONS;

  const wizardState = useMemo(
    () =>
      deriveVisitaWizardState({
        isNew,
        loading: workspaceLoading,
        error: workspaceError,
        workspace: workspace ?? null,
      }),
    [isNew, workspaceLoading, workspaceError, workspace],
  );

  const locked = wizardState.locked;


  // Check-in existente para esta visita (habilita Etapa 3)
  const { data: checkinExistente } = useQuery({
    queryKey: ["wizard-checkin-flag", registroId],
    enabled: !!registroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      const { data } = await supabase
        .from("visitas_checkin")
        .select("id")
        .eq("registro_consultor_id", registroId!)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Registro de campo já preenchido (habilita Etapa 4)
  const { data: campoExistente } = useQuery({
    queryKey: ["wizard-campo-flag", registroId],
    enabled: !!registroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      const { data } = await supabase
        .from("visitas_campo" as any)
        .select("id")
        .eq("registro_consultor_id", registroId!)
        .maybeSingle();
      return data;
    },
  });

  // Diagnóstico já registrado (habilita Etapa 5)
  const { data: diagExistente } = useQuery({
    queryKey: ["wizard-diag-flag", registroId],
    enabled: !!registroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      const { data } = await supabase
        .from("visita_diagnosticos")
        .select("id")
        .eq("registro_id", registroId!)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Recomendação já registrada (habilita Etapa 6)
  const { data: recExistente } = useQuery({
    queryKey: ["wizard-rec-flag", registroId],
    enabled: !!registroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("id")
        .eq("registro_consultor_id", registroId!)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Anexos são opcionais; só persistências canônicas liberam as etapas seguintes.
  const unlockedUpTo = wizardUnlockedUpTo({
    identificacao: !isNew && !!registro,
    checkin: !!checkinExistente,
    campo: !!campoExistente,
    diagnostico: !!diagExistente,
    recomendacao: !!recExistente,
  });

  // Auto-advance para etapa solicitada via ?step= (respeitando unlockedUpTo)
  const stepParam = Number(searchParams.get("step") || 0);
  useEffect(() => {
    if (!stepParam) return;
    if (stepParam > 1 && stepParam <= unlockedUpTo && currentStep < stepParam) {
      setCurrentStep(stepParam);
    }
  }, [stepParam, unlockedUpTo, currentStep]);

  // Selects — capturam erro e propagam para exibição
  const {
    data: clientes,
    isError: clientesErr,
    refetch: refetchClientes,
  } = useQuery({
    queryKey: ["wizard-clientes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: fazendas,
    isError: fazendasErr,
    refetch: refetchFazendas,
  } = useQuery({
    queryKey: ["wizard-fazendas", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fazendas")
        .select("id, nome")
        .eq("cliente_id", clienteId)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: talhoes,
    isError: talhoesErr,
    refetch: refetchTalhoes,
  } = useQuery({
    queryKey: ["wizard-talhoes", fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talhoes")
        .select("id, nome, cultura_id")
        .eq("fazenda_id", fazendaId)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: culturas,
    isError: culturasErr,
    refetch: refetchCulturas,
  } = useQuery({
    queryKey: ["wizard-culturas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("culturas").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Reset filhos quando pai muda (apenas em criação; pula durante restauração inicial)
  const skipResetRef = useRef<boolean>(!!localIdParam);
  useEffect(() => {
    if (!isNew) return;
    if (skipResetRef.current) return;
    setFazendaId("");
    setTalhaoId("");
  }, [clienteId, isNew]);
  useEffect(() => {
    if (!isNew) return;
    if (skipResetRef.current) return;
    setTalhaoId("");
  }, [fazendaId, isNew]);
  useEffect(() => {
    if (restoredFromLocal) skipResetRef.current = false;
  }, [restoredFromLocal]);

  // Autopreenche cultura a partir do talhão
  useEffect(() => {
    if (!talhaoId || culturaId) return;
    const t = talhoes?.find((x) => x.id === talhaoId);
    if (t?.cultura_id) setCulturaId(t.cultura_id);
  }, [talhaoId, talhoes, culturaId]);

  const isDirty =
    isNew &&
    saveState !== "saved" &&
    saveState !== "pending_sync" &&
    (clienteId !== "" ||
      fazendaId !== "" ||
      talhaoId !== "" ||
      culturaId !== "" ||
      objetivo.trim() !== "" ||
      safra.trim() !== "" ||
      faseFenologica.trim() !== "");
  useUnsavedChanges(isDirty);

  const validate = () => {
    if (!clienteId) return "Selecione o produtor.";
    if (!fazendaId) return "Selecione a fazenda.";
    if (!talhaoId) return "Selecione o talhão.";
    if (!culturaId) return "Selecione a cultura.";
    if (!dataVistoria) return "Informe a data da visita.";
    if (!tipoVisita) return "Selecione o tipo de visita.";
    if (!objetivo.trim()) return "Informe o objetivo da visita.";
    return null;
  };

  const handleContinuar = async () => {
    if (locked) return;
    if (saveState === "saving") return; // impede duplo clique
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    // Edição versionada da Etapa 1 (visita já existente)
    if (!isNew) {
      if (!isOnline) {
        toast.error("Sem conexão: edição da identificação exige estar online.");
        return;
      }
      setSaveState("saving");
      try {
        const { data, error } = await supabase.rpc(
          "rpc_atualizar_identificacao_visita" as never,
          {
            p_registro_id: registroId,
            p_expected_version: workspace?.version ?? (registro as any)?.version ?? 1,
            p_payload: {
              cultura_id: culturaId || null,
              data_vistoria: dataVistoria,
              tipo_visita: tipoVisita,
              objetivo_visita: objetivo.trim() || null,
              safra: safra.trim() || null,
              fase_fenologica: faseFenologica.trim() || null,
            },
          } as never,
        );
        if (error) throw error;
        void data;
        setSaveState("saved");
        await queryClient.invalidateQueries({ queryKey: visitaWorkspaceKey(registroId) });
        await queryClient.invalidateQueries({ queryKey: ["mobile-wizard-registro", registroId] });
        toast.success("Identificação atualizada.");
        setCurrentStep(2);
      } catch (e: any) {
        setSaveState("error");
        const msg = String(e?.message ?? "");
        if (msg.includes("version_conflict")) {
          toast.error("Esta visita foi alterada por outra pessoa. Recarregue para continuar.");
        } else if (msg.includes("status_nao_editavel")) {
          toast.error("Esta visita não está mais em status editável.");
        } else if (msg.includes("forbidden")) {
          toast.error("Você não tem permissão para editar esta visita.");
        } else {
          toast.error("Não foi possível atualizar a identificação.");
        }
      }
      return;
    }

    setSaveState("saving");
    const clientUuid = clientUuidRef.current;

    const payload = {
      p_client_uuid: clientUuid,
      p_cliente_id: clienteId,
      p_fazenda_id: fazendaId,
      p_talhao_id: talhaoId,
      p_cultura_id: culturaId,
      p_data_vistoria: dataVistoria,
      p_tipo_visita: tipoVisita,
      p_objetivo_visita: objetivo.trim() || null,
      p_safra: safra.trim() || null,
      p_fase_fenologica: faseFenologica.trim() || null,
      p_solicitacao_id: solicitacaoId,
    };

    if (!isOnline) {
      try {
        const existing = await getPendingRegistroById(clientUuid);
        if (existing) {
          await updatePendingRegistro(clientUuid, {
            payload,
            syncStatus: "pending_sync",
          });
        } else {
          await savePendingRegistro({
            id: clientUuid,
            clientUuid,
            operationType: "create_technical_visit",
            payload,
            createdAt: new Date().toISOString(),
            synced: false,
            syncStatus: "pending_sync",
          });
        }
        setSaveState("pending_sync");
        toast.success("Rascunho salvo. Sincronizará quando houver conexão.");
        // preserva local_id na URL para reabertura
        if (!localIdParam) {
          navigate(`/app/visita/novo?local_id=${clientUuid}${solicitacaoId ? `&solicitacao=${solicitacaoId}` : ""}`, {
            replace: true,
          });
        }
      } catch (e) {
        console.error(e);
        setSaveState("error");
        toast.error("Não foi possível salvar o rascunho local.");
      }
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        "rpc_criar_visita_idempotente" as never,
        payload as never,
      );
      if (error) throw error;
      const res = data as unknown as RpcResponse;
      if (!res?.ok) {
        setSaveState("error");
        toast.error(ERROR_LABELS[res?.error ?? ""] ?? "Não foi possível criar a visita.");
        return;
      }
      setSaveState("saved");
      // Preserva mapping local→remoto (permite reabrir via ?local_id após remoção da pendência)
      if (res.registro_id) {
        try {
          await saveSyncedVisitMapping({
            localId: clientUuid,
            clientUuid,
            remoteId: res.registro_id,
            version: res.version ?? null,
            syncedAt: Date.now(),
          });
        } catch { /* noop */ }
      }
      // Remove rascunho local após mapping preservado (B0.3)
      try {
        const local = await getPendingRegistroById(clientUuid);
        if (local) {
          const { removePendingRegistro } = await import("@/lib/offlineDb");
          await removePendingRegistro(clientUuid);
        }
      } catch { /* noop */ }
      toast.success(res.created ? "Visita criada." : "Rascunho reaberto.");
      navigate(`/app/visita/${res.registro_id}?step=2${solicitacaoId ? `&solicitacao=${solicitacaoId}` : ""}`, {
        replace: true,
      });
    } catch (e) {
      console.error("rpc_criar_visita_idempotente:", e);
      setSaveState("error");
      toast.error("Erro ao criar visita.");
    }
  };

  // Resolvendo rascunho local por local_id — não mostrar formulário vazio
  if (localIdParam && localRes.state === "resolving") {
    return (
      <div className="p-6 text-center space-y-3">
        <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Restaurando rascunho…</p>
      </div>
    );
  }

  if (localIdParam && localRes.state === "not_found") {
    return (
      <div className="p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm">Este rascunho local não foi encontrado ou já foi removido.</p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/app/atendimentos")}>
            Voltar para visitas
          </Button>
          <Button size="sm" onClick={() => navigate("/app/visita/novo", { replace: true })}>
            Criar nova visita
          </Button>
        </div>
      </div>
    );
  }

  if (localIdParam && localRes.state === "resolve_error") {
    return (
      <div className="p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
        <p className="text-sm">Erro ao recuperar visita sincronizada.</p>
        {localRes.message && (
          <p className="text-xs text-muted-foreground">{localRes.message}</p>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate("/app/atendimentos")}>
          Voltar
        </Button>
      </div>
    );
  }

  // Loading do modo edição
  if (registroId && loadingRegistro) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
        <div className="h-24 rounded bg-muted animate-pulse" />
        <div className="h-24 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (registroId && !registro && !loadingRegistro) {
    return (
      <div className="p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
        <p className="text-sm">Visita não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/app/atendimentos")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-2 p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/app/atendimentos")}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">
              {isNew ? "Nova visita" : "Visita técnica"}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">
              Etapa {currentStep} de {STEPS.length} · {STEPS[currentStep - 1].label}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 max-w-[50%] text-right">
            {!workspaceLoading && !workspaceError && workspace?.status && (
              <span className="text-xs font-medium break-words">
                {STATUS_LABEL_REGISTRO[workspace.status as RegistroStatus] ?? workspace.status}
              </span>
            )}
            <SaveStatus state={saveState} />
          </div>
        </div>
        <div className="px-3 pb-2">
          <StepIndicator
            current={currentStep}
            unlockedUpTo={unlockedUpTo}
            onGo={(id) => setCurrentStep(id)}
          />
        </div>
        {!isOnline && (
          <div className="bg-amber-50 border-t border-amber-200 text-amber-700 text-[11px] px-3 py-1 flex items-center gap-1">
            <WifiOff className="h-3 w-3" />
            Sem conexão — o rascunho será sincronizado quando você voltar a ficar online.
          </div>
        )}
        {wizardState.message && (
          <div
            data-testid="visita-wizard-banner"
            data-state={wizardState.state}
            className={
              wizardState.state === "erro"
                ? "bg-destructive/10 border-t border-destructive/20 text-destructive text-[11px] px-3 py-1 flex items-center justify-between gap-2"
                : "bg-muted border-t text-muted-foreground text-[11px] px-3 py-1 flex items-center gap-1"
            }
          >
            <span className="flex items-center gap-1">
              {wizardState.state === "erro" ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              {wizardState.message}
            </span>
            {wizardState.canRetry && (
              <button type="button" className="underline" onClick={() => refetchWorkspace()}>
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {(clientesErr || fazendasErr || talhoesErr || culturasErr || !!registroError) && (
          <div className="bg-destructive/10 border-t border-destructive/20 text-destructive text-[11px] px-3 py-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {clientesErr && "Não foi possível carregar produtores."}
              {fazendasErr && " Não foi possível carregar fazendas."}
              {talhoesErr && " Não foi possível carregar talhões."}
              {culturasErr && " Não foi possível carregar culturas."}
              {registroError ? " Erro ao carregar visita." : ""}
            </span>
            <button
              type="button"
              className="underline"
              onClick={() => {
                if (clientesErr) refetchClientes();
                if (fazendasErr) refetchFazendas();
                if (talhoesErr) refetchTalhoes();
                if (culturasErr) refetchCulturas();
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}
      </header>

      {/* Corpo */}
      <main className="flex-1 p-4 space-y-4" onChangeCapture={() => { formHydration.current.dirty = true; }}>
        {currentStep === 1 && (
          <>
        <Card className="p-4 space-y-3">
          <div>
            <Label htmlFor="cliente">Produtor *</Label>
            <Select value={clienteId} onValueChange={setClienteId} disabled={locked || !isNew}>
              <SelectTrigger id="cliente"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {clientes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="fazenda">Fazenda *</Label>
            <Select value={fazendaId} onValueChange={setFazendaId} disabled={locked || !clienteId}>
              <SelectTrigger id="fazenda"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {fazendas?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="talhao">Talhão *</Label>
            <Select value={talhaoId} onValueChange={setTalhaoId} disabled={locked || !fazendaId}>
              <SelectTrigger id="talhao"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {talhoes?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="cultura">Cultura *</Label>
            <Select value={culturaId} onValueChange={setCulturaId} disabled={locked}>
              <SelectTrigger id="cultura"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {culturas?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="data">Data da visita *</Label>
              <Input
                id="data"
                type="date"
                value={dataVistoria}
                onChange={(e) => setDataVistoria(e.target.value)}
                disabled={locked}
              />
            </div>
            <div>
              <Label htmlFor="tipo">Tipo *</Label>
              <Select value={tipoVisita} onValueChange={(v) => setTipoVisita(v as TipoVisita)} disabled={locked}>
                <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="objetivo">Objetivo da visita *</Label>
            {objetivos && objetivos.length > 0 ? (
              <Select value={objetivo} onValueChange={setObjetivo} disabled={locked}>
                <SelectTrigger id="objetivo"><SelectValue placeholder="Selecione ou digite…" /></SelectTrigger>
                <SelectContent>
                  {objetivos.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

            ) : (
              <Input
                id="objetivo"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Ex.: Diagnóstico de infestação"
                disabled={locked}
                maxLength={200}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="safra">Safra</Label>
              <Input
                id="safra"
                value={safra}
                onChange={(e) => setSafra(e.target.value)}
                placeholder="Ex.: 2025/26"
                disabled={locked}
                maxLength={20}
              />
            </div>
            <div>
              <Label htmlFor="fase">Fase fenológica</Label>
              <Input
                id="fase"
                value={faseFenologica}
                onChange={(e) => setFaseFenologica(e.target.value)}
                placeholder="Ex.: V6"
                disabled={locked}
                maxLength={40}
              />
            </div>
          </div>
        </Card>
          </>
        )}

        {currentStep === 2 && registroId && (
          <WizardCheckinStep
            registroId={registroId}
            clienteId={registro?.cliente_id ?? clienteId ?? null}
            fazendaId={registro?.fazenda_id ?? fazendaId ?? null}
            talhaoId={registro?.talhao_id ?? talhaoId ?? null}
            solicitacaoId={registro?.solicitacao_id ?? solicitacaoId ?? null}
            locked={locked}
            onDone={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 2 && !registroId && (
          <Card className="p-4 text-sm text-muted-foreground text-center">
            Finalize a Etapa 1 online para habilitar o check-in.
          </Card>
        )}

        {currentStep === 3 && (
          <WizardCampoStep
            localRegistroId={registroId ?? registro?.id ?? ""}
            remoteRegistroId={registroId ?? null}
            clienteId={registro?.cliente_id ?? clienteId ?? null}
            clientUuid={registro?.client_uuid ?? null}
            locked={locked}
            onDone={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 4 && (
          <WizardDiagnosticoStep
            localRegistroId={registroId ?? registro?.id ?? ""}
            remoteRegistroId={registroId ?? null}
            locked={locked}
            onDone={() => setCurrentStep(5)}
          />
        )}

        {currentStep === 5 && (
          <WizardRecomendacaoStep
            localRegistroId={registroId ?? registro?.id ?? ""}
            remoteRegistroId={registroId ?? null}
            locked={locked}
            onDone={() => setCurrentStep(6)}
          />
        )}

        {currentStep === 6 && (
          <WizardAnexosStep
            remoteRegistroId={registroId ?? null}
            locked={locked}
            onDone={() => setCurrentStep(7)}
          />
        )}

        {currentStep === 8 && (
          <AcompanhamentoVisita workspace={workspace} isLoading={workspaceLoading} />
        )}

        {currentStep === 7 && (
          <WizardRevisaoStep
            remoteRegistroId={registroId ?? null}
            locked={locked}
          />
        )}
      </main>

      {/* Footer com navegação */}
      <footer className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-3 flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => navigate("/app/atendimentos")}>
          Voltar
        </Button>
        {currentStep === 1 ? (
          <Button
            onClick={handleContinuar}
            disabled={locked || saveState === "saving"}
            className="flex-1 max-w-[220px]"
          >
            {saveState === "saving" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
            ) : (
              <>{isNew ? "Criar rascunho" : "Continuar"} <ChevronRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        ) : (
          <div className="text-[11px] text-muted-foreground text-right">
            Etapa {currentStep} de {STEPS.length}
          </div>
        )}
      </footer>
    </div>
  );
}
