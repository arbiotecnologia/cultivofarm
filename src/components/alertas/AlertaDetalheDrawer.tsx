import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AlertaGravidadeBadge } from "./AlertaGravidadeBadge";
import { AlertaStatusBadge } from "./AlertaStatusBadge";
import { AlertaSLABadge } from "./sla/AlertaSLABadge";
import { AlertaSLATimeline } from "./sla/AlertaSLATimeline";
import type { AlertaOperacional } from "@/hooks/useAlertasOperacionais";
import { useAlertasSLA } from "@/hooks/useAlertasSLA";
import { useAuth } from "@/hooks/useAuth";
import { podeVerAlertas } from "@/lib/alertasPermissions";
import { supabase } from "@/integrations/supabase/client";
import { useAlertasRealtime } from "@/hooks/useAlertasRealtime";
import { formatDateTimeDisplay, formatDateDisplay } from "@/lib/date-utils";
import { Eye, CheckCircle2, XCircle, RotateCcw, ExternalLink, UserPlus, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Acao {
  id: string;
  acao: string;
  observacao: string | null;
  user_id: string | null;
  created_at: string;
}

interface Props {
  alerta: AlertaOperacional | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onMarcarLido: (id: string) => Promise<void>;
  onResolver: (id: string, obs?: string) => Promise<void>;
  onIgnorar: (id: string, obs?: string) => Promise<void>;
  onReabrir: (id: string, obs?: string) => Promise<void>;
  onLeituraAutomatica?: (id: string) => void | Promise<void>;
}

function rotaRelacionada(a: AlertaOperacional): string | null {
  if (a.os_id) return `/ordens-servico`;
  if (a.registro_consultor_id) return `/consultor-tecnico`;
  if (a.lote_id) return `/lotes`;
  if (a.entrega_id) return `/entregas`;
  if (a.origem === "laboratorio" || a.origem === "cq") return `/cockpit-laboratorio`;
  if (a.origem === "visita") return `/visita-tecnica`;
  return null;
}

export function AlertaDetalheDrawer({
  alerta,
  open,
  onOpenChange,
  onMarcarLido,
  onResolver,
  onIgnorar,
  onReabrir,
  onLeituraAutomatica,
}: Props) {
  const [obs, setObs] = useState("");
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [busy, setBusy] = useState(false);
  const { role } = useAuth();
  const podeAgir = podeVerAlertas(role);

  const { eventosSLA, registrarPrimeiraResposta, assumirAlerta, refetch: refetchSLA } =
    useAlertasSLA(alerta?.id);

  const carregarAcoes = async (alertaId: string) => {
    const { data } = await (supabase as any)
      .from("alertas_acoes")
      .select("id, acao, observacao, user_id, created_at")
      .eq("alerta_id", alertaId)
      .order("created_at", { ascending: false });
    setAcoes((data ?? []) as Acao[]);
  };

  useEffect(() => {
    if (!alerta) return;
    setObs("");
    try {
      onLeituraAutomatica?.(alerta.id);
    } catch {
      /* noop */
    }
    carregarAcoes(alerta.id);
  }, [alerta, onLeituraAutomatica]);

  // Realtime: recarrega histórico e eventos SLA quando há atualização para este alerta;
  // NÃO fecha o drawer e não reseta filtros da página.
  useAlertasRealtime({
    enabled: !!alerta && open,
    channelName: `alerta-detalhe-${alerta?.id ?? "none"}`,
    onAcoesChange: (alertaId) => {
      if (alerta && alertaId === alerta.id) {
        carregarAcoes(alerta.id);
        refetchSLA();
      }
    },
  });

  const run = async (fn: () => Promise<void>, msg: string, closeOnSuccess = true) => {
    if (!alerta) return;
    try {
      setBusy(true);
      await fn();
      toast.success(msg);
      if (closeOnSuccess) onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao processar ação");
    } finally {
      setBusy(false);
    }
  };

  if (!alerta) return null;
  const rota = rotaRelacionada(alerta);
  const resolvido = alerta.status === "resolvido" || alerta.status === "ignorado";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <AlertaGravidadeBadge gravidade={alerta.gravidade} />
            <AlertaStatusBadge status={alerta.status} />
            <span className="text-xs text-muted-foreground uppercase">{alerta.origem}</span>
            <AlertaSLABadge
              slaResolucaoEm={alerta.sla_resolucao_em}
              slaVencido={!!alerta.sla_vencido}
              escalonado={!!alerta.escalonado}
              resolvido={resolvido}
            />
          </div>
          <SheetTitle className="text-left">{alerta.titulo}</SheetTitle>
          <SheetDescription className="text-left">{alerta.descricao}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          {alerta.proxima_acao && (
            <div>
              <p className="text-xs text-muted-foreground">Próxima ação</p>
              <p>{alerta.proxima_acao}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Criado em</p>
              <p>{formatDateDisplay(alerta.created_at)}</p>
            </div>
            {typeof alerta.prioridade_score === "number" && (
              <div>
                <p className="text-xs text-muted-foreground">Prioridade</p>
                <p>P{alerta.prioridade_score}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Prazo 1ª resposta</p>
              <p>{alerta.sla_primeira_resposta_em ? formatDateTimeDisplay(alerta.sla_primeira_resposta_em) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Prazo resolução</p>
              <p>{alerta.sla_resolucao_em ? formatDateTimeDisplay(alerta.sla_resolucao_em) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">1ª resposta em</p>
              <p>{alerta.primeira_resposta_em ? formatDateTimeDisplay(alerta.primeira_resposta_em) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Responsável</p>
              <p className="truncate">{alerta.responsavel_id ?? "—"}</p>
            </div>
          </div>

          {Object.keys(alerta.metadata ?? {}).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Contexto</p>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                {JSON.stringify(alerta.metadata, null, 2)}
              </pre>
            </div>
          )}

          {rota && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to={rota}>
                <ExternalLink className="h-4 w-4 mr-2" /> Abrir item relacionado
              </Link>
            </Button>
          )}

          {podeAgir && (
            <>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Observação (opcional)</p>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !!alerta.primeira_resposta_em}
                  onClick={() =>
                    run(async () => { await registrarPrimeiraResposta(alerta.id); }, "Primeira resposta registrada", false)
                  }
                >
                  <MessageSquareReply className="h-4 w-4 mr-2" /> 1ª resposta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(async () => { await assumirAlerta(alerta.id); }, "Alerta assumido", false)
                  }
                >
                  <UserPlus className="h-4 w-4 mr-2" /> Assumir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => onMarcarLido(alerta.id), "Marcado como lido (apenas para você)", false)}
                >
                  <Eye className="h-4 w-4 mr-2" /> Lido
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => onResolver(alerta.id, obs || undefined), "Alerta resolvido")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Resolver
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => onIgnorar(alerta.id, obs || undefined), "Alerta ignorado")}
                >
                  <XCircle className="h-4 w-4 mr-2" /> Ignorar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => onReabrir(alerta.id, obs || undefined), "Alerta reaberto")}
                >
                  <RotateCcw className="h-4 w-4 mr-2" /> Reabrir
                </Button>
              </div>
            </>
          )}

          <Separator />

          <div>
            <p className="text-xs text-muted-foreground mb-2">Eventos SLA</p>
            <AlertaSLATimeline eventos={eventosSLA} />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Histórico de ações</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {acoes.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma ação registrada.</p>
              )}
              {acoes.map((a) => (
                <div key={a.id} className="text-xs border-l-2 border-muted pl-2">
                  <p className="font-medium">{a.acao}</p>
                  {a.observacao && <p className="text-muted-foreground">{a.observacao}</p>}
                  <p className="text-muted-foreground">
                    {formatDateTimeDisplay(a.created_at)}
                    {!a.user_id && " · sistema"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
