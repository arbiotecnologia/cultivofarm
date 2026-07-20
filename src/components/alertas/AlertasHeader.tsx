import { Siren, RefreshCw, Zap, Radio, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  onRefresh: () => void;
  loading?: boolean;
  podeGerar?: boolean;
  onGerar?: () => void;
  gerando?: boolean;
  realtimeConnected?: boolean;
  realtimeEnabled?: boolean;
}

export function AlertasHeader({
  onRefresh,
  loading,
  podeGerar,
  onGerar,
  gerando,
  realtimeConnected,
  realtimeEnabled,
}: Props) {
  const rtOk = realtimeEnabled !== false && realtimeConnected;
  const rtLabel = rtOk
    ? "Atualização em tempo real ativa"
    : realtimeEnabled === false
      ? "Atualização automática indisponível. Use o botão Recarregar."
      : "Conectando atualização em tempo real…";

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Siren className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Central de Alertas</h1>
          <p className="text-sm text-muted-foreground">
            Alertas operacionais gerados a partir de visitas, OS, laboratório, CQ, estoque e entregas.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border",
                  rtOk
                    ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                    : "border-muted text-muted-foreground bg-muted/30"
                )}
                aria-label={rtLabel}
              >
                {rtOk ? (
                  <Radio className="h-3 w-3 animate-pulse" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {rtOk ? "Tempo real" : "Manual"}
              </span>
            </TooltipTrigger>
            <TooltipContent>{rtLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || gerando}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Recarregar
        </Button>
        {podeGerar && onGerar && (
          <Button size="sm" onClick={onGerar} disabled={gerando || loading}>
            <Zap className={`h-4 w-4 mr-2 ${gerando ? "animate-pulse" : ""}`} />
            {gerando ? "Atualizando..." : "Atualizar alertas"}
          </Button>
        )}
      </div>
    </div>
  );
}

