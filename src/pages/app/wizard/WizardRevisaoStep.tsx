import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Lock, WifiOff, FileCheck2, ClipboardList, Send } from "lucide-react";
import { toast } from "sonner";
import { canTransition, showTransitionErrorToast, STATUS_LABEL_REGISTRO, type RegistroStatus } from "@/lib/registroTransitions";

interface Props {
  remoteRegistroId: string | null;
  locked: boolean;
}

export default function WizardRevisaoStep({ remoteRegistroId, locked }: Props) {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [finalizing, setFinalizing] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: registro, isLoading } = useQuery({
    queryKey: ["wizard-revisao-registro", remoteRegistroId],
    enabled: !!remoteRegistroId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor")
        .select(`
          *,
          clientes:cliente_id(nome),
          fazendas:fazenda_id(nome),
          talhoes:talhao_id(nome),
          culturas:cultura_id(nome)
        `)
        .eq("id", remoteRegistroId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["wizard-revisao-counts", remoteRegistroId],
    enabled: !!remoteRegistroId,
    queryFn: async () => {
      const [checkin, campo, diag, rec, anexos] = await Promise.all([
        supabase.from("visitas_checkin").select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId!),
        supabase.from("visitas_campo" as any).select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId!),
        supabase.from("visita_diagnosticos").select("id", { count: "exact", head: true }).eq("registro_id", remoteRegistroId!),
        supabase.from("registros_consultor_recomendacoes").select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId!),
        supabase.from("registros_consultor_arquivos").select("id", { count: "exact", head: true }).eq("registro_consultor_id", remoteRegistroId!).neq("categoria_arquivo", "checkin"),
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

  const handleFinalizar = async () => {
    if (!remoteRegistroId) return;
    if (!isOnline) {
      toast.error("Sem conexão. Finalização exige internet.");
      return;
    }
    if (!canFinalize) {
      showTransitionErrorToast(`Transição inválida: não é possível mudar de "${status}" para "finalizado".`);
      return;
    }
    if (!confirm("Finalizar esta visita? Após finalizar, o conteúdo ficará somente leitura.")) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.rpc("rpc_finalizar_visita_v2" as any, {
        p_registro_id: remoteRegistroId,
        p_expected_version: registro?.version ?? 1,
      });
      if (error) {
        const msg = translateRpcError(error.message, error.message || "Não foi possível finalizar a visita.");
        toast.error(msg);
        await queryClient.invalidateQueries({ queryKey: ["wizard-revisao-registro", remoteRegistroId] });
        return;
      }
      toast.success("Visita finalizada.");
      await queryClient.invalidateQueries({ queryKey: ["wizard-revisao-registro", remoteRegistroId] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-wizard-registro", remoteRegistroId] });
      navigate("/app/atendimentos");
    } catch (err: any) {
      showTransitionErrorToast(err, "Não foi possível finalizar a visita.");
    } finally {
      setFinalizing(false);
    }
  };

  const canSendApproval = useMemo(() => canTransition(status, "enviado_aprovacao"), [status]);

  const handleEnviarAprovacao = async () => {
    if (!remoteRegistroId) return;
    if (!isOnline) {
      toast.error("Sem conexão.");
      return;
    }
    if (!canSendApproval) {
      showTransitionErrorToast(`Transição inválida: não é possível mudar de "${status}" para "enviado_aprovacao".`);
      return;
    }
    if (!confirm("Enviar esta visita para aprovação?")) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("rpc_enviar_visita_aprovacao" as any, {
        p_registro_id: remoteRegistroId,
        p_expected_version: registro?.version ?? 1,
      });
      if (error) {
        const msg = translateRpcError(error.message, error.message || "Não foi possível enviar para aprovação.");
        toast.error(msg);
        await queryClient.invalidateQueries({ queryKey: ["wizard-revisao-registro", remoteRegistroId] });
        return;
      }
      toast.success("Visita enviada para aprovação.");
      await queryClient.invalidateQueries({ queryKey: ["wizard-revisao-registro", remoteRegistroId] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-wizard-registro", remoteRegistroId] });
      navigate("/app/atendimentos");
    } catch (err: any) {
      showTransitionErrorToast(err, "Não foi possível enviar para aprovação.");
    } finally {
      setSending(false);
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
          <dd className="font-medium truncate">{registro.culturas?.nome ?? "—"}</dd>
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
          <Button
            className="w-full"
            size="lg"
            onClick={handleFinalizar}
            disabled={finalizing || !isOnline || !canFinalize}
          >
            {finalizing ? (
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
            onClick={handleEnviarAprovacao}
            disabled={sending || !isOnline || !canSendApproval}
          >
            {sending ? (
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
