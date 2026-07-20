import { useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle, RotateCw, X, Zap, Image as ImageIcon, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { QueueProgress, QueueItem } from "@/hooks/useMediaUploadQueue";
import { formatFileSize } from "@/lib/mediaCompression";


interface UploadQueuePanelProps {
  progress: QueueProgress;
  items: QueueItem[];
  isPaused?: boolean;
  onRetryFailed?: () => void;
  onClearFinished?: () => void;
  onTogglePause?: () => void;
  onCancelItem?: (id: string) => void;
  onCancelAll?: () => void;
}

export function UploadQueuePanel({
  progress,
  items,
  isPaused,
  onRetryFailed,
  onClearFinished,
  onTogglePause,
  onCancelItem,
  onCancelAll,
}: UploadQueuePanelProps) {
  if (progress.total === 0 && items.length === 0) return null;

  const pct =
    progress.total > 0
      ? Math.round(((progress.completed + progress.failed) / progress.total) * 100)
      : 0;

  const failedItems = items.filter((i) => i.status === "error");
  const pendingItems = items.filter((i) => i.status === "queued" || i.status === "compressing" || i.status === "uploading");
  const isActive = progress.completed + progress.failed < progress.total;

  // Auto-limpar fila após upload concluído com sucesso (sem falhas e sem pendentes)
  useEffect(() => {
    if (!isActive && failedItems.length === 0 && pendingItems.length === 0 && items.length > 0 && onClearFinished) {
      const timer = setTimeout(() => {
        onClearFinished();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isActive, failedItems.length, pendingItems.length, items.length, onClearFinished]);


  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isActive ? (
            isPaused ? (
              <Pause className="h-4 w-4 text-amber-500" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )
          ) : progress.failed > 0 ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          )}
          <div className="flex flex-col min-w-0">
            <p className="text-xs font-semibold truncate">
              {isPaused ? "Fila pausada" : isActive ? "Enviando arquivos..." : "Upload concluído"}
            </p>
            {progress.current && isActive && !isPaused && (
              <span className="text-[10px] text-muted-foreground truncate leading-tight">
                Processando: {progress.current}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded border shadow-sm">
            <span className="text-primary font-bold">{progress.completed}</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-bold">{progress.total}</span>
            {progress.failed > 0 && (
              <span className="text-destructive font-bold">({progress.failed} falhas)</span>
            )}
          </div>
          
          {isActive && onTogglePause && (
            <Button
              size="icon"
              variant="outline"
              onClick={onTogglePause}
              className={cn(
                "h-7 w-7",
                isPaused ? "text-green-600 border-green-200 bg-green-50 hover:bg-green-100" : "text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100"
              )}
              title={isPaused ? "Continuar upload" : "Pausar upload"}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-1.5" />
      
      {items.length > 0 && (
        <ul className="space-y-1.5 max-h-48 overflow-auto pr-1">
          {items.map((it) => (
            <li
              key={it.id}
              className={cn(
                "flex items-center gap-2 text-[11px] p-1.5 rounded border border-transparent transition-colors",
                it.status === "error" && "bg-destructive/5 border-destructive/10 text-destructive",
                it.status === "uploading" && "bg-primary/5 border-primary/10 text-primary",
                it.status === "compressing" && "bg-amber-500/5 border-amber-500/10 text-amber-600",
                it.status === "done" && "text-muted-foreground opacity-80"
              )}
            >
              {it.previewUrl ? (
                <div className="h-10 w-10 rounded overflow-hidden flex-shrink-0 border bg-muted shadow-sm">
                  <img src={it.previewUrl} className="h-full w-full object-cover" alt="" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded flex items-center justify-center flex-shrink-0 border bg-muted shadow-sm">
                  {it.kind === 'audio' ? <Zap className="h-4 w-4 opacity-40" /> : <ImageIcon className="h-4 w-4 opacity-40" />}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate font-medium block leading-tight">{it.fileName}</span>
                    {it.quality === 'hd' && (
                      <span className="bg-blue-100 text-blue-700 text-[8px] px-1 py-0 rounded font-black tracking-tighter shrink-0 border border-blue-200">HD</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {it.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    {it.status === "compressing" && <Loader2 className="h-3 w-3 animate-spin text-amber-500" />}
                    {it.status === "done" && <CheckCircle2 className="h-3 w-3 text-primary" />}
                    {it.status === "error" && <AlertCircle className="h-3 w-3 text-destructive" />}
                    {it.status === "queued" && isPaused && <Pause className="h-3 w-3 text-amber-500" />}
                    
                    {(it.status === "queued" || it.status === "error") && onCancelItem && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onCancelItem(it.id)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 opacity-80 text-[10px]">
                  {it.originalSize && (
                    <span className={cn(it.compressedSize && "line-through opacity-50")}>
                      {formatFileSize(it.originalSize)}
                    </span>
                  )}
                  {it.compressedSize && it.compressedSize !== it.originalSize && (
                    <div className="flex items-center gap-1">
                      <span className="text-primary font-medium">{formatFileSize(it.compressedSize)}</span>
                      <span className="bg-green-100 text-green-700 px-1 rounded text-[9px] font-bold">
                        -{Math.round((1 - it.compressedSize / it.originalSize!) * 100)}%
                      </span>
                    </div>
                  )}
                  {it.status === "compressing" && <span className="text-amber-600 font-medium">Otimizando mídias ({it.quality === 'hd' ? 'HD' : '4G'})...</span>}
                  {it.status === "uploading" && <span className="text-primary animate-pulse">Enviando arquivos...</span>}
                  {it.error && <span className="font-bold text-destructive">Falha: {it.error}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(failedItems.length > 0 || items.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {failedItems.length > 0 && onRetryFailed && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetryFailed}
              className="h-7 text-[10px] flex-1 border-destructive/30 hover:bg-destructive/10 text-destructive whitespace-nowrap"
            >
              <RotateCw className="h-3 w-3 mr-1" />
              Tentar novamente ({failedItems.length})
            </Button>
          )}

          {pendingItems.length > 0 && onCancelAll && (
            <Button
              size="sm"
              variant="outline"
              onClick={onCancelAll}
              className="h-7 text-[10px] flex-1 border-muted-foreground/30 hover:bg-muted whitespace-nowrap"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Cancelar pendentes ({pendingItems.length})
            </Button>
          )}

          {!isActive && items.length > 0 && onClearFinished && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearFinished}
              className="h-7 text-[10px] text-muted-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Limpar fila
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
