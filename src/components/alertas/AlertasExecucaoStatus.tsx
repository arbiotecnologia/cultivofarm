import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle, Loader2, Clock, AlertTriangle } from "lucide-react";
import { useAlertasExecucoes } from "@/hooks/useAlertasExecucoes";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function statusBadge(status: string) {
  switch (status) {
    case "concluida":
      return (
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/5">
          <CheckCircle2 className="h-3 w-3 mr-1" />Concluída
        </Badge>
      );
    case "falhou":
      return (
        <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">
          <XCircle className="h-3 w-3 mr-1" />Falhou
        </Badge>
      );
    case "iniciada":
      return (
        <Badge variant="outline" className="border-blue-500/40 text-blue-600 bg-blue-500/5">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />Em execução
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function tipoLabel(tipo: string) {
  switch (tipo) {
    case "manual": return "Manual (painel)";
    case "edge_function": return "Automática (cron)";
    case "cron": return "Cron";
    case "automatico": return "Automática";
    case "sistema": return "Sistema";
    default: return tipo;
  }
}

export function AlertasExecucaoStatus() {
  const { loading, ultimaExecucao, totalFalhasRecentes, podeVer } = useAlertasExecucoes(20);

  if (!podeVer) return null;

  if (loading && !ultimaExecucao) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando status do motor...
        </CardContent>
      </Card>
    );
  }

  if (!ultimaExecucao) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Activity className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Motor de alertas</p>
            <p className="text-xs text-muted-foreground">
              Nenhuma execução registrada ainda. Use “Atualizar alertas” para rodar manualmente.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dur =
    ultimaExecucao.duracao_ms != null
      ? `${(ultimaExecucao.duracao_ms / 1000).toFixed(1)}s`
      : "—";
  const quando = ultimaExecucao.iniciado_em
    ? formatDistanceToNow(new Date(ultimaExecucao.iniciado_em), { addSuffix: true, locale: ptBR })
    : "—";

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Última execução do motor</p>
              <p className="text-xs text-muted-foreground">
                {tipoLabel(ultimaExecucao.tipo_execucao)} • {quando}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(ultimaExecucao.status)}
            {totalFalhasRecentes > 0 && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {totalFalhasRecentes} falha(s) em 24h
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Duração</p>
            <p className="font-semibold flex items-center gap-1"><Clock className="h-3 w-3" />{dur}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Processados</p>
            <p className="font-semibold">{ultimaExecucao.total_processados}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Criados</p>
            <p className="font-semibold">{ultimaExecucao.total_criados}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Atualizados</p>
            <p className="font-semibold">{ultimaExecucao.total_atualizados}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Resolvidos auto.</p>
            <p className="font-semibold">{ultimaExecucao.total_resolvidos_automaticamente}</p>
          </div>
        </div>

        {ultimaExecucao.status === "falhou" && ultimaExecucao.erro && (
          <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-2">
            Erro: {ultimaExecucao.erro}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
