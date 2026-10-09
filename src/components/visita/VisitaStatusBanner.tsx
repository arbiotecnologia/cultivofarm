import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import { useVisitaWorkspace } from "@/hooks/useVisitaWorkspace";
import { podeDecidir, RPC_GERACAO_OS_DISPONIVEL } from "@/lib/fluxo-tecnico/fluxo";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Lock, Pencil, Save, X, AlertTriangle, Loader2,
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
  { key: "os", label: "OS / Aplicação", icon: PackageCheck },
  { key: "concluida", label: "Concluída", icon: Flag },
];

function getEtapaAtiva(status?: string, proximoPasso?: string): string {
  switch (status) {
    case "finalizado": return etapaAtivaFinalizada(proximoPasso);
    case "enviado_aprovacao": return "aprovacao";
    case "aprovado": return "produtor";
    case "convertido_os": return "os";
    case "arquivado":
    case "reprovado": return "concluida";
    default: return "finalizada";
  }
}

export function VisitaStatusBanner({
  status, proximoPasso, isEditing, canReopen, finalizedAt, saving,
  onReopen, onSave, onCancel, registroId, osExistenteId,
}: Props) {
  const { role } = useAuth();
  const { converterRecomendacaoEmOS } = useFluxoVisitaTecnica();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const geraArtefatoAprovavel = desfechoGeraArtefatoAprovavel(proximoPasso);

  if (!status || status === "rascunho") return null;

  const dateLabel = finalizedAt
    ? formatDateTimeDisplay(finalizedAt)
    : null;

  // Editing variant
  if (isEditing) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Editando visita finalizada</p>
          <p className="text-xs text-amber-800">As alterações serão registradas no histórico com o motivo informado.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar alterações
          </Button>
        </div>
      </div>
    );
  }

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
        ? "A OS Multi-Produto está aguardando aprovação para liberar o PCP."
        : "Aguardando análise do responsável técnico.";
    cta = { label: "Ver fila de aprovação", onClick: () => navigate("/fluxo-tecnico?tab=aprovacoes") };
    tone = "indigo";
  } else if (status === "aprovado") {
    titulo = "Recomendação aprovada";
    descricao = "O produtor já pode visualizar no Portal e decidir: aceitar, solicitar aplicação (gerar OS) ou recusar.";
    cta = { label: "Acompanhar no Fluxo Técnico", onClick: () => navigate("/fluxo-tecnico?tab=aprovados") };
    tone = "violet";
  } else if (status === "convertido_os") {
    titulo = "OS gerada — em execução";
    descricao = "A demanda agora segue pelo pipeline da Ordem de Serviço (reserva → expedição → aplicação).";
    cta = { label: "Ver Ordens de Serviço", onClick: () => navigate("/ordens-servico") };
    tone = "amber";
  } else if (status === "reprovado") {
    titulo = "Recomendação reprovada";
    descricao = "Reveja os apontamentos da aprovação técnica e ajuste se necessário.";
    cta = { label: "Ver motivo", onClick: () => navigate("/fluxo-tecnico?tab=aprovacoes") };
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
            {isFinalized && canReopen && (
              <Button size="sm" variant="outline" className="border-emerald-300" onClick={() => setOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" /> Editar visita
              </Button>
            )}
            {registroId && (status === "aprovado" || (geraArtefatoAprovavel && status === "enviado_aprovacao")) && (
              <TechnicalDecisionActions registroId={registroId} mode={status === "aprovado" ? "reabrir" : "liberar"} />
            )}
            
            {RPC_GERACAO_OS_DISPONIVEL && registroId && status === "aprovado" && !osExistenteId && (role === "administrador" || role === "gestor" || role === "consultor_tecnico" || role === "tecnico_agronomo") && (
              <Button 
                size="sm" 
                className="bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-sm"
                onClick={async () => {
                  const res = await converterRecomendacaoEmOS(registroId);
                  if (res.success) {
                    navigate(`/ordens-servico`);
                  }
                }}
              >
                <PackageCheck className="h-4 w-4" /> 
                Gerar OS de Produção
              </Button>
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

      <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMotivo(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir visita para edição?</AlertDialogTitle>
            <AlertDialogDescription>
              Toda alteração ficará registrada no histórico desta visita.
              Informe o motivo da edição (mínimo 5 caracteres).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motivo da edição <span className="text-destructive">*</span></Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: corrigir dose recomendada, ajustar problema identificado..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={motivo.trim().length < 5}
              onClick={() => { onReopen(motivo.trim()); setOpen(false); setMotivo(""); }}
            >
              Reabrir para edição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
