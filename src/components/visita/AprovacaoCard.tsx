import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRight,
  History,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABEL_REGISTRO } from "@/lib/registroTransitions";
import { cn } from "@/lib/utils";

const STATUS_APROVACAO: Record<string, { label: string; className: string; icon: LucideIcon }> = {
  pendente: {
    label: "Pendente",
    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    icon: Clock,
  },
  aprovado: {
    label: "Aprovado",
    className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    icon: CheckCircle2,
  },
  reprovado: {
    label: "Reprovado",
    className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    icon: XCircle,
  },
  solicitar_ajuste: {
    label: "Ajuste solicitado",
    className: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    icon: RotateCcw,
  },
};

interface AprovacaoCardProps {
  registroId: string;
  registroStatus?: string | null;
}

const VISIBLE_STATUSES = new Set([
  "enviado_aprovacao",
  "aprovado",
  "convertido_os",
  "arquivado",
]);

export function AprovacaoCard({ registroId, registroStatus }: AprovacaoCardProps) {
  const { data: aprovacoes = [] } = useQuery({
    queryKey: ["visita-aprovacoes", registroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aprovacoes_tecnicas")
        .select("*")
        .eq("registro_consultor_id", registroId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!registroId,
    refetchInterval: 180000,
    refetchOnWindowFocus: true,
  });

  const gestorIds = Array.from(
    new Set(aprovacoes.map((a) => a.aprovado_por).filter((id): id is string => id !== null))
  );

  const { data: gestores = [] } = useQuery({
    queryKey: ["aprovacao-gestores", gestorIds],
    enabled: gestorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome")
        .in("user_id", gestorIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: log = [] } = useQuery({
    queryKey: ["visita-status-log", registroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor_status_log")
        .select("*")
        .eq("registro_consultor_id", registroId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!registroId,
    refetchInterval: 180000,
  });

  const changedByIds = Array.from(
    new Set(log.map((l) => l.changed_by).filter((id): id is string => id !== null))
  );

  const { data: logUsers = [] } = useQuery({
    queryKey: ["status-log-users", changedByIds],
    enabled: changedByIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome")
        .in("user_id", changedByIds);
      if (error) throw error;
      return data || [];
    },
  });

  if (!registroStatus || !VISIBLE_STATUSES.has(registroStatus)) return null;

  const ultimaAprovacao: Tables<"aprovacoes_tecnicas"> | undefined = aprovacoes[0];
  const statusKey = ultimaAprovacao?.status_aprovacao || "pendente";
  const statusInfo = STATUS_APROVACAO[statusKey] || STATUS_APROVACAO.pendente;
  const StatusIcon = statusInfo.icon;

  const gestorNome =
    gestores.find((g) => g.user_id === ultimaAprovacao?.aprovado_por)?.nome ||
    null;

  const userNameById = (uid: string | null) =>
    logUsers.find((u) => u.user_id === uid)?.nome || null;

  const formatDate = (iso?: string | null) => formatDateTimeDisplay(iso) || "—";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Aprovação técnica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status atual */}
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge variant="outline" className={cn("gap-1.5", statusInfo.className)}>
              <StatusIcon className="h-3.5 w-3.5" />
              {statusInfo.label}
            </Badge>
            {ultimaAprovacao?.data_aprovacao && (
              <span className="text-xs text-muted-foreground">
                {formatDate(ultimaAprovacao.data_aprovacao)}
              </span>
            )}
          </div>
          {gestorNome && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserIcon className="h-3 w-3" />
              <span>Aprovado por: {gestorNome}</span>
            </div>
          )}
          {ultimaAprovacao?.comentario_gestor && (
            <p className="text-xs text-foreground/80 border-l-2 border-primary/40 pl-2 italic">
              "{ultimaAprovacao.comentario_gestor}"
            </p>
          )}
          {!ultimaAprovacao && (
            <p className="text-xs text-muted-foreground">
              Aguardando análise do gestor responsável.
            </p>
          )}
        </div>

        {/* Histórico de mudanças */}
        {log.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Histórico de mudanças
            </div>
            <ol className="space-y-2 border-l border-border pl-3">
              {log.map((entry) => {
                const fromLabel =
                  STATUS_LABEL_REGISTRO[entry.status_anterior as keyof typeof STATUS_LABEL_REGISTRO] ||
                  entry.status_anterior ||
                  "—";
                const toLabel =
                  STATUS_LABEL_REGISTRO[entry.status_novo as keyof typeof STATUS_LABEL_REGISTRO] ||
                  entry.status_novo;
                const author = userNameById(entry.changed_by);
                return (
                  <li key={entry.id} className="relative text-xs">
                    <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-muted-foreground">{fromLabel}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{toLabel}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {formatDate(entry.changed_at)}
                      {author ? ` · ${author}` : ""}
                    </div>
                    {entry.motivo && (
                      <p className="mt-1 text-foreground/80 border-l-2 border-muted pl-2 italic">
                        "{entry.motivo}"
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
