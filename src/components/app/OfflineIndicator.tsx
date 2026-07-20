import { WifiOff, CloudUpload, Loader2, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { SyncProgress } from "@/hooks/useOfflineSync";

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  onSync: () => void;
  progress?: SyncProgress;
}

export function OfflineIndicator({
  isOnline,
  pendingCount,
  syncing,
  onSync,
  progress,
}: OfflineIndicatorProps) {
  const showProgress = syncing && progress && progress.total > 0;
  const remaining = progress
    ? Math.max(0, progress.total - progress.completed - progress.failed)
    : 0;
  const pct = progress && progress.total > 0
    ? Math.round(((progress.completed + progress.failed) / progress.total) * 100)
    : 0;

  if (isOnline && pendingCount === 0 && !showProgress) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[60] px-4 py-2 text-sm font-medium transition-colors",
        !isOnline
          ? "bg-destructive text-destructive-foreground"
          : syncing
          ? "bg-amber-500 text-white"
          : "bg-primary text-primary-foreground"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isOnline ? (
            <>
              <WifiOff className="h-4 w-4 shrink-0" />
              <span className="truncate">Modo offline — dados serão salvos localmente</span>
            </>
          ) : syncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="truncate">
                Sincronizando{progress?.current ? ` — ${progress.current}` : "..."}
              </span>
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4 shrink-0" />
              <span>{pendingCount} pendente(s)</span>
            </>
          )}
        </div>

        {isOnline && pendingCount > 0 && !syncing && (
          <button
            onClick={onSync}
            className="flex items-center gap-1 bg-white/20 rounded-full px-3 py-0.5 text-xs font-semibold active:scale-95 transition-transform shrink-0"
          >
            <CloudUpload className="h-3 w-3" />
            Sincronizar
          </button>
        )}
      </div>

      {showProgress && (
        <div className="mt-1.5 space-y-1">
          <Progress value={pct} className="h-1.5 bg-white/20" />
          <div className="flex items-center justify-between text-[11px] opacity-90">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Check className="h-3 w-3" /> {progress!.completed}
              </span>
              {progress!.failed > 0 && (
                <span className="flex items-center gap-0.5">
                  <AlertTriangle className="h-3 w-3" /> {progress!.failed}
                </span>
              )}
            </div>
            <span>{remaining} restantes • {pct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
