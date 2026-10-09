import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TECHNICAL_STALE_REVALIDATION } from "@/hooks/useVisitaWorkspace";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Lock, WifiOff, FileCheck2, ClipboardList, Send } from "lucide-react";
import { toast } from "sonner";
import { canTransition, STATUS_LABEL_REGISTRO, type RegistroStatus } from "@/lib/registroTransitions";

interface Props {
  remoteRegistroId: string | null;
  locked: boolean;
}

export default function WizardRevisaoStep({ remoteRegistroId, locked }: Props) {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"finalizar" | "aprovar" | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const submissionLock = useRef(false);

  const { data: registro, isLoading } = useQuery({
    queryKey: ["wizard-revisao-registro", remoteRegistroId],
    enabled: !!remoteRegistroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      if (!remoteRegistroId) return null;
      const { data, error } = await supabase
        .from("registros_consultor")
        .select(`
          *,
          clientes:cliente_id(nome),
          fazendas:fazenda_id(nome),
          talhoes:talhao_id(nome),
          culturas:cultura_id(nome)
        `)
        .eq("id", remoteRegistroId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["wizard-revisao-counts", remoteRegistroId],
    enabled: !!remoteRegistroId,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async () => {
      if (!remoteRegistroId) return null;
      const [checkin, campo, diag, rec, anexos] = await Promise.all([
        supabase.from("visitas_checkin").select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId),
        supabase.from("visitas_campo" as never).select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId),
        supabase.from("visita_diagnosticos").select("id", { count: "exact", head: true }).eq("registro_id", remoteRegistroId),
        supabase.from("registros_consultor_recomendacoes").select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId),
        supabase.from("registros_consultor_arquivos").select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId).neq("categoria_arquivo", "checkin"),
      ]);
      return {
        checkin: checkin.count ?? 0,
        campo: campo.count ?? 0,
        diagnosticos: diag.count ?? 0,
        recomendacoes: rec.count ?? 0,
        anexos: anexos.count ?? 0,
      };
    },
  });

  const status = (registro?.status ?? "rascunho") as RegistroStatus;
  const canFinalize = useMemo(() => canTransition(status, "finalizado"), [status]);
  const alreadyFinalized = status !== "rascunho";
  // Cultura é obrigatória para finalizar (regra de negócio da visita técnica).
  const culturaAusente = !!registro && !registro.cultura_id;


  const translateRpcError = (code: string | undefined, fallback: string): string => {
    switch (code) {
      case "version_conflict": return "Versão desatualizada. Recarregue a visita e tente novamente.";
      case "diagnostico_obrigatorio": return "Adicione ao menos um diagnóstico antes de finalizar.";
      case "checkin_obrigatorio": return "É necessário registrar o check-in antes de finalizar.";
      case "visita_nao_editavel": return "Visita não está mais em modo editável.";
      case "transicao_invalida": return "Transição de status inválida para o estado atual.";
      case "sem_permissao": return "Você não tem permissão para executar essa ação.";
      default: return fallback;
    }
  };

  const canSendApproval = useMemo(() => canTransition(status, "enviado_aprovacao"), [status]);
  const actionAllowed = action === "finalizar"
    ? !locked && status === "rascunho" && canFinalize && !culturaAusente
    : status === "finalizado" && canSendApproval;

  const openConfirmation = (next: "finalizar" | "aprovar") => {
    if (submissionLock.current) return;
    setActionError(null);
    setAction(next);
  };

  const handleConfirm = async () => {
    if (submissionLock.current || !action || !remoteRegistroId) return;
    if (!isOnline || !actionAllowed) {
      setActionError(!isOnline ? "Sem conexão. Esta ação exige internet." : "Esta ação não está disponível no estado atual da visita.");
      return;
    }
    submissionLock.current = true;
    setPending(true);
    setActionError(null);
    try {
      const { error } = await supabase.rpc(
        (action === "finalizar" ? "rpc_finalizar_visita_v2" : "rpc_enviar_visita_aprovacao") as never,
        { p_registro_id: remoteRegistroId, p_expected_version: registro?.version ?? 1 } as never,
      );
      if (error) throw error;
      toast.success(action === "finalizar" ? "Visita finalizada." : "Visita enviada para aprovação.");
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wizard-revisao-registro", remoteRegistroId] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-wizard-registro", remoteRegistroId] }),
        queryClient.invalidateQueries({ queryKey: ["visita-workspace", remoteRegistroId] }),
        queryClient.invalidateQueries({ queryKey: ["atendimentos-tecnicos"] }),
        queryClient.invalidateQueries({ queryKey: ["atendimentos-tecnicos-resumo"] }),
      ]);
      navigate("/app/atendimentos");
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err && typeof err.message === "string" ? err.message : undefined;
      const msg = translateRpcError(message, message || "Não foi possível concluir a operação. Tente novamente.");
      setActionError(msg);
      toast.error(msg);
      await queryClient.invalidateQueries({ queryKey: ["wizard-revisao-registro", remoteRegistroId] });
    } finally {
      submissionLock.current = false;
      setPending(false);
    }
  };

  if (!remoteRegistroId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground text-center">
        Sincronize a visita para revisar.
      </Card>
    );
  }

  if (isLoading || !registro) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <AlertDialog open={action !== null} onOpenChange={(open) => {
        if (!open && !submissionLock.current) { setAction(null); setActionError(null); }
      }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg" onEscapeKeyDown={(event) => { if (submissionLock.current) event.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{action === "finalizar" ? "Finalizar esta visita?" : "Enviar esta visita para aprovação?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {action === "finalizar" ? "Após finalizar, o conteúdo ficará somente leitura." : "A visita será encaminhada para aprovação técnica."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && <p role="alert" className="text-sm text-destructive break-words">{actionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button onClick={handleConfirm} disabled={pending || !isOnline || !actionAllowed}>
              {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {pending ? "Aguarde…" : action === "finalizar" ? "Confirmar finalização" : "Confirmar envio"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Resumo da visita</h3>
          </div>
          <Badge variant={alreadyFinalized ? "default" : "secondary"}>
            {STATUS_LABEL_REGISTRO[status] ?? status}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Produtor</dt>
          <dd className="font-medium truncate">{registro.clientes?.nome ?? "—"}</dd>
          <dt className="text-muted-foreground">Fazenda</dt>
          <dd className="font-medium truncate">{registro.fazendas?.nome ?? "—"}</dd>
          <dt className="text-muted-foreground">Talhão</dt>
          <dd className="font-medium truncate">{registro.talhoes?.nome ?? "—"}</dd>
          <dt className="text-muted-foreground">Cultura</dt>
          <dd className={registro.cultura_id ? "font-medium truncate" : "font-medium truncate text-destructive"}>
            {registro.culturas?.nome ?? "Não informada"}
          </dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd className="font-medium">{registro.data_vistoria ?? "—"}</dd>
          <dt className="text-muted-foreground">Tipo</dt>
          <dd className="font-medium">{registro.tipo_visita ?? "—"}</dd>
          {registro.safra && (<><dt className="text-muted-foreground">Safra</dt><dd className="font-medium">{registro.safra}</dd></>)}
          {registro.fase_fenologica && (<><dt className="text-muted-foreground">Fase</dt><dd className="font-medium">{registro.fase_fenologica}</dd></>)}
        </dl>
        {registro.objetivo_visita && (
          <div className="pt-1 border-t">
            <div className="text-xs text-muted-foreground">Objetivo</div>
            <div className="text-sm">{registro.objetivo_visita}</div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileCheck2 className="h-4 w-4" /> Conteúdo coletado
        </h3>
        <ul className="text-xs space-y-1">
          <li className="flex justify-between"><span>Check-in</span><Badge variant="outline">{counts?.checkin ?? 0}</Badge></li>
          <li className="flex justify-between"><span>Registro de campo</span><Badge variant="outline">{counts?.campo ?? 0}</Badge></li>
          <li className="flex justify-between"><span>Diagnósticos</span><Badge variant="outline">{counts?.diagnosticos ?? 0}</Badge></li>
          <li className="flex justify-between"><span>Recomendações</span><Badge variant="outline">{counts?.recomendacoes ?? 0}</Badge></li>
          <li className="flex justify-between"><span>Anexos</span><Badge variant="outline">{counts?.anexos ?? 0}</Badge></li>
        </ul>
      </Card>

      {status === "rascunho" && !locked && (
        <Card className="p-4 space-y-2">
          {!isOnline && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              <WifiOff className="h-3.5 w-3.5 mt-0.5" />
              <span>Sem conexão — finalização ficará disponível quando voltar online.</span>
            </div>
          )}
          {culturaAusente && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <p className="font-medium">Cultura obrigatória não informada.</p>
              <p className="mt-0.5">
                Complete a etapa <strong>Identificação</strong> antes de finalizar a visita.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7"
                onClick={() => navigate(`/app/visita/${remoteRegistroId}?step=identificacao`)}
              >
                Ir para Identificação
              </Button>
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={() => openConfirmation("finalizar")}
            disabled={pending || !isOnline || !canFinalize || culturaAusente}
          >
            {pending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Finalizando…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar visita</>
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Após finalizar, o conteúdo ficará somente leitura e poderá ser enviado para aprovação.
          </p>
        </Card>
      )}


      {status === "finalizado" && (
        <Card className="p-4 space-y-2">
          {!isOnline && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              <WifiOff className="h-3.5 w-3.5 mt-0.5" />
              <span>Sem conexão — envio ficará disponível quando voltar online.</span>
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={() => openConfirmation("aprovar")}
            disabled={pending || !isOnline || !canSendApproval}
          >
            {pending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Enviar para aprovação</>
            )}
          </Button>
        </Card>
      )}

      {(locked || (status !== "rascunho" && status !== "finalizado")) && (
        <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Visita em modo somente leitura ({STATUS_LABEL_REGISTRO[status] ?? status}).
        </Card>
      )}
    </div>
  );
}
