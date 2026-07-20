import { formatDateTimeDisplay } from "@/lib/date-utils";

import { CheckCircle2, XCircle, RefreshCw, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SyncStatusBadgeProps {
  logs: any[];
  onRetry: () => void;
  isSyncing: boolean;
}

export function SyncStatusBadge({ logs, onRetry, isSyncing }: SyncStatusBadgeProps) {
  const latest = logs && logs.length > 0 
    ? [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;

  const isFailed = latest?.status === "failed";
  const isSynced = latest?.status === "synced";

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 cursor-help">
              {isSynced && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 px-1.5 py-0 h-5">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="text-[10px]">Sincronizado</span>
                </Badge>
              )}
              {isFailed && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1 px-1.5 py-0 h-5">
                  <XCircle className="h-3 w-3" />
                  <span className="text-[10px]">Falha Sync</span>
                </Badge>
              )}
              {!latest && (
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 gap-1 px-1.5 py-0 h-5">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-[10px]">Não sincronizado</span>
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              {latest ? (
                <>
                  <p>Status: {latest.status}</p>
                  {latest.error_message && (
                    <p className="text-red-400 font-mono max-w-[200px] break-words">Erro: {latest.error_message}</p>
                  )}
                  <p className="text-muted-foreground">Última tentativa: {formatDateTimeDisplay(latest.created_at)}</p>
                </>
              ) : (
                <p>Esta visita ainda não foi sincronizada com o calendário.</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {(isFailed || !isSynced) && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          disabled={isSyncing}
          title={!latest ? "Sincronizar com Google" : "Tentar novamente"}
        >
          <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  );
}
