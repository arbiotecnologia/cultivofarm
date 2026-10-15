import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import { useVisitaWorkspace } from "@/hooks/useVisitaWorkspace";
import { podeDecidir, RPC_GERACAO_OS_DISPONIVEL } from "@/lib/fluxo-tecnico/fluxo";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Lock,
  ClipboardCheck, UserCheck, FileSearch, PackageCheck, ArrowRight, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { STATUS_LABEL_REGISTRO } from "@/lib/registroTransitions";
import {
  desfechoGeraArtefatoAprovavel, descricaoVisitaFinalizada, etapaAtivaFinalizada,
} from "@/lib/visita/desfechoVisita";

interface Props {
  status?: string;
  proximoPasso?: string;
  isEditing: boolean;
  canReopen: boolean;
  finalizedAt?: string | null;
  saving?: boolean;
  onReopen: (motivo: string) => void;
  onSave: () => void;
  onCancel: () => void;
  registroId?: string;
  osExistenteId?: string | null;
}

type FluxoEtapa = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ETAPAS_FLUXO: FluxoEtapa[] = [
  { key: "finalizada", label: "Finalizada", icon: ClipboardCheck },
  { key: "aprovacao", label: "Aprovação técnica", icon: UserCheck },
  { key: "produtor", label: "Decisão do produtor", icon: FileSearch },
  { key: "os", label: "Encaminhamento laboratorial", icon: PackageCheck },
  { key: "concluida", label: "Concluída", icon: Flag },
];

function getEtapaAtiva(status?: string, proximoPasso?: string): string {
  switch (status) {
    case "finalizado": return etapaAtivaFinalizada(proximoPasso);
    case "enviado_aprovacao": return "aprovacao";
    case "aprovado": return "aprovacao";
    case "convertido_os": return "os";
    case "arquivado":
    case "reprovado": return "concluida";
    default: return "finalizada";
  }
}

export function VisitaStatusBanner({
  status, proximoPasso, finalizedAt, registroId, osExistenteId,
}: Props) {
  const navigate = useNavigate();
  const geraArtefatoAprovavel = desfechoGeraArtefatoAprovavel(proximoPasso);

  if (!status || status === "rascunho") return null;

  const dateLabel = finalizedAt
    ? formatDateTimeDisplay(finalizedAt)
    : null;

  const label = STATUS_LABEL_REGISTRO[status] || status;
  const etapaAtiva = getEtapaAtiva(status, proximoPasso);
  const etapaIdx = ETAPAS_FLUXO.findIndex(e => e.key === etapaAtiva);

  // Contextual title / description / CTA
  let titulo = "";
  let descricao = "";
  let cta: { label: string; onClick: () => void } | null = null;
  let tone: "emerald" | "indigo" | "amber" | "violet" | "slate" = "slate";

  if (status === "finalizado") {
    titulo = `Visita finalizada${dateLabel ? ` em ${dateLabel}` : ""}`;
    descricao = descricaoVisitaFinalizada(proximoPasso);
    tone = "emerald";
  } else if (status === "enviado_aprovacao") {
    titulo = "Aguardando aprovação técnica";
    descricao = proximoPasso === "emitir_recomendacao"
      ? "A recomendação foi enviada. Um responsável técnico precisa aprovar antes do produtor ser notificado."
      : proximoPasso === "gerar_os"
        ? "A recomendação está aguardando aprovação técnica antes do encaminhamento laboratorial."
        : "Aguardando análise do responsável técnico.";
    cta = { label: "Ver fila de aprovação", onClick: () => navigate("/fluxo-tecnico?tab=aprovacoes") };
    tone = "indigo";
  } else if (status === "aprovado") {
    titulo = "Recomendação aprovada";
    descricao = "Recomendação disponível para consulta. Decisão do produtor indisponível nesta fase.";
    cta = { label: "Acompanhar no Fluxo Técnico", onClick: () => navigate("/fluxo-tecnico?tab=aprovados") };
    tone = "violet";
  } else if (status === "convertido_os") {
    titulo = "Recomendação encaminhada ao laboratório";
    descricao = "Uma recomendação foi encaminhada à OS. O encaminhamento não confirma início da fabricação nem conclusão comercial; consulte a OS para acompanhar a produção.";
    cta = { label: "Ver Ordens de Serviço", onClick: () => navigate("/ordens-servico") };
    tone = "amber";
  } else if (status === "reprovado") {
    titulo = "Recomendação reprovada";
    descricao = "Visita reprovada, somente para consulta. Consulte o motivo no histórico; edição e reenvio não estão disponíveis.";
    cta = { label: "Ver motivo", onClick: () => navigate("?tab=acompanhamento") };
    tone = "amber";
  } else if (status === "arquivado") {
    titulo = "Visita arquivada";
    descricao = "Esta demanda foi encerrada e está disponível apenas para consulta.";
    tone = "slate";
  } else {
    titulo = `Visita em ${label.toLowerCase()}`;
    descricao = "Esta visita já foi enviada e não pode mais ser editada.";
    tone = "slate";
  }

  const toneStyles: Record<typeof tone, { border: string; bg: string; iconBg: string; iconText: string; title: string; desc: string }> = {
    emerald: { border: "border-emerald-300", bg: "bg-emerald-50", iconBg: "bg-emerald-100", iconText: "text-emerald-700", title: "text-emerald-900", desc: "text-emerald-800" },
    indigo:  { border: "border-indigo-300",  bg: "bg-indigo-50",  iconBg: "bg-indigo-100",  iconText: "text-indigo-700",  title: "text-indigo-900",  desc: "text-indigo-800"  },
    violet:  { border: "border-violet-300",  bg: "bg-violet-50",  iconBg: "bg-violet-100",  iconText: "text-violet-700",  title: "text-violet-900",  desc: "text-violet-800"  },
    amber:   { border: "border-amber-300",   bg: "bg-amber-50",   iconBg: "bg-amber-100",   iconText: "text-amber-700",   title: "text-amber-900",   desc: "text-amber-800"   },
    slate:   { border: "border-slate-300",   bg: "bg-slate-50",   iconBg: "bg-slate-100",   iconText: "text-slate-700",   title: "text-slate-900",   desc: "text-slate-700"   },
  };
  const t = toneStyles[tone];
  const isFinalized = status === "finalizado";

  return (
    <>
      <div className={cn("rounded-lg border p-3 space-y-3", t.border, t.bg)}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className={cn("p-2 rounded-full shrink-0", t.iconBg, t.iconText)}>
            {isFinalized ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-semibold", t.title)}>{titulo}</p>
            <p className={cn("text-xs", t.desc)}>{descricao}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {cta && (
              <Button size="sm" variant="outline" className={cn(t.border)} onClick={cta.onClick}>
                {cta.label} <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {registroId && (status === "aprovado" || (geraArtefatoAprovavel && status === "enviado_aprovacao")) && (
              <TechnicalDecisionActions registroId={registroId} mode={status === "aprovado" ? "reabrir" : "liberar"} />
            )}
            
            {RPC_GERACAO_OS_DISPONIVEL && registroId && status === "aprovado" && !osExistenteId && (
              <LaboratoryConversionAction key={registroId} registroId={registroId} />
            )}

            {registroId && status === "aprovado" && osExistenteId && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/ordens-servico")}
              >
                <PackageCheck className="h-4 w-4" />
                Abrir OS
              </Button>
            )}

            {status === "convertido_os" && (
              <Button 
                size="sm" 
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/ordens-servico")}
              >
                <PackageCheck className="h-4 w-4" /> 
                Ver Ordem de Serviço
              </Button>
            )}
          </div>
        </div>

        {/* Mini fluxo da demanda */}
        <div className="flex items-center gap-1 overflow-x-auto pt-1">
          {ETAPAS_FLUXO.map((etapa, idx) => {
            const Icon = etapa.icon;
            const done = idx < etapaIdx;
            const active = idx === etapaIdx;
            return (
              <div key={etapa.key} className="flex items-center gap-1 shrink-0">
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border",
                  active ? cn(t.iconBg, t.iconText, t.border) :
                  done ? "bg-muted text-foreground/70 border-muted" :
                  "bg-background text-muted-foreground border-dashed border-muted-foreground/30"
                )}>
                  <Icon className="h-3 w-3" />
                  <span>{etapa.label}</span>
                </div>
                {idx < ETAPAS_FLUXO.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

    </>
  );
}

/** Decisões transacionais; reanálise não chama o callback de edição local. */
export function TechnicalDecisionActions({ registroId, mode = "decidir", onSuccess }: {
  registroId: string; mode?: "decidir" | "liberar" | "reabrir"; onSuccess?: () => void;
}) {
  const { roles, loading, user, profile } = useAuth();
  const workspace = useVisitaWorkspace(registroId);
  const actions = useFluxoVisitaTecnica();
  const [action, setAction] = useState<"aprovar" | "ajuste" | "reprovar" | "reabrir" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const ws = workspace.data;
  const ready = !loading && !!user && profile?.user_id === user.id && profile.ativo === true && !!profile.organization_id
    && !workspace.isFetching && !workspace.isError && ws?.permissions.can_approve === true;
  const allowed = ready && (mode === "reabrir"
    ? roles.includes("administrador") && ws?.status === "aprovado"
    : roles.some((role) => podeDecidir(role, ws?.status)));
  const needsReason = action !== "aprovar";
  const labels = { aprovar: mode === "liberar" ? "Liberar para Produtor" : "Aprovar recomendação", ajuste: "Solicitar ajuste", reprovar: "Reprovar recomendação", reabrir: "Reabrir análise" };
  const open = (next: NonNullable<typeof action>) => { setAction(next); setMotivo(""); setError(""); };
  const submit = async () => {
    if (lock.current || !allowed || !action || (needsReason && !motivo.trim())) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = action === "aprovar" ? await actions.liberarRecomendacaoParaProdutor(registroId)
        : action === "ajuste" ? await actions.solicitarAjusteVisita(registroId, motivo, ws?.version ?? undefined)
        : action === "reprovar" ? await actions.reprovarRecomendacao(registroId, motivo, ws?.version ?? undefined)
        : await actions.reabrirVisita(registroId, motivo, ws?.version ?? undefined);
      if (!result.success) {
        setError(result.message);
        await workspace.refetch();
        return;
      }
      setAction(null); setMotivo(""); onSuccess?.();
    } catch {
      setError("Não foi possível concluir a decisão. Tente novamente.");
      await workspace.refetch();
    } finally { lock.current = false; setBusy(false); }
  };
  return <>
    {allowed && <div className="flex flex-wrap gap-2">
      {mode === "reabrir" ? <Button size="sm" variant="outline" onClick={() => open("reabrir")}>Reabrir análise</Button> : <>
        <Button size="sm" onClick={() => open("aprovar")}>{labels.aprovar}</Button>
        {mode === "decidir" && <>
          <Button size="sm" variant="outline" onClick={() => open("ajuste")}>Solicitar ajuste</Button>
          <Button size="sm" variant="destructive" onClick={() => open("reprovar")}>Reprovar recomendação</Button>
        </>}
      </>}
    </div>}
    <AlertDialog open={action !== null} onOpenChange={(value) => { if (!value && !lock.current) { setAction(null); setMotivo(""); setError(""); } }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (lock.current) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{action ? labels[action] : "Decisão técnica"}</AlertDialogTitle>
          <AlertDialogDescription>{action === "reabrir" ? "A recomendação voltará à análise técnica, sem liberar edição direta." : "Confirma o registro desta decisão técnica?"}</AlertDialogDescription>
        </AlertDialogHeader>
        {needsReason && <div className="space-y-2"><Label htmlFor={`decision-reason-${registroId}`}>Motivo</Label><Textarea id={`decision-reason-${registroId}`} value={motivo} disabled={busy} onChange={(event) => setMotivo(event.target.value)} /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button disabled={busy || !allowed || (needsReason && !motivo.trim())} onClick={() => { void submit(); }}>Confirmar decisão</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

/** Somente encaminhamento singular; nenhuma ação operacional do laboratório. */
export function LaboratoryConversionAction({ registroId }: { registroId: string }) {
  const { roles, loading, user, profile } = useAuth();
  const workspace = useVisitaWorkspace(registroId);
  const { converterRecomendacaoEmOS } = useFluxoVisitaTecnica();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const ws = workspace.data;
  const actor = JSON.stringify([loading, user?.id, profile?.user_id, profile?.ativo, profile?.organization_id, [...roles].sort(), registroId]);
  const current = useRef({ actor, epoch: 0 });
  if (current.current.actor !== actor) current.current = { actor, epoch: current.current.epoch + 1 };
  useEffect(() => () => { current.current.epoch += 1; }, []);
  const ready = !loading && !!user && profile?.user_id === user.id && profile.ativo === true && !!profile.organization_id
    && !workspace.isFetching && !workspace.isError && ws?.permissions.can_manage === true && ws.permissions.can_convert_os === true
    && roles.some(role => ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo"].includes(role));
  const existing = (ws?.ordens_servico?.length ?? 0) > 0;
  const allowed = ready && ws?.status === "aprovado" && !existing;
  const dialogActor = useRef({ actor, epoch: current.current.epoch });
  const sameDialog = dialogActor.current.actor === actor && dialogActor.current.epoch === current.current.epoch;
  const submit = async () => {
    if (lock.current || !allowed || !sameDialog) return;
    lock.current = true; setBusy(true); setError("");
    const epoch = current.current.epoch;
    try {
      const result = await converterRecomendacaoEmOS(registroId);
      if (current.current.epoch !== epoch) return;
      if (!result.success) { setError(result.message); await workspace.refetch(); return; }
      setOpen(false);
    } catch {
      if (current.current.epoch === epoch) setError("Não foi possível confirmar o encaminhamento. Reconsulte a visita.");
    } finally {
      lock.current = false;
      if (current.current.epoch === epoch) setBusy(false);
    }
  };
  return <>
    {allowed && <Button size="sm" disabled={lock.current} className="gap-2" onClick={() => {
      if (lock.current) return;
      dialogActor.current = { actor, epoch: current.current.epoch }; setBusy(false); setError(""); setOpen(true);
    }}><PackageCheck className="h-4 w-4" />Gerar OS laboratorial</Button>}
    <AlertDialog open={open && sameDialog} onOpenChange={value => { if (!lock.current) setOpen(value); }}>
      <AlertDialogContent onEscapeKeyDown={event => { if (lock.current) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Encaminhar recomendação ao laboratório?</AlertDialogTitle>
          <AlertDialogDescription>Uma única recomendação marcada, com produto biológico ou microrganismo, criará OS e programação pendente. As recomendações comerciais não serão concluídas. Volume não informado exige definição antes de fabricar; esta ação não inicia fabricação.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button disabled={busy || !allowed} onClick={() => { void submit(); }}>{busy ? "Encaminhando…" : "Confirmar encaminhamento"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
