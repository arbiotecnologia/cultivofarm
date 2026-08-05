import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getFailedRemoteMedia,
  retryFailedMedia,
  removePendingFoto,
  type PendingFoto,
} from "@/lib/offlineDb";
import { toast } from "sonner";

interface Props {
  /** Dispara a sincronização geral após reabilitar as mídias. */
  onSync: () => void;
  syncing: boolean;
}

/**
 * Mídias de visitas JÁ existentes no servidor que esgotaram as tentativas de
 * reenvio (`sync_error`). O estado é recuperável: o usuário pode reenviar
 * (zera tentativas e sincroniza) ou redefinir/descartar apenas a mídia.
 * A visita pai NUNCA é removida por esta tela.
 */
export function PendingMediaRecovery({ onSync, syncing }: Props) {
  const [items, setItems] = useState<PendingFoto[]>([]);

  const refresh = useCallback(async () => {
    try {
      setItems(await getFailedRemoteMedia());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, syncing]);

  if (items.length === 0) return null;

  const handleRetry = async (id: string) => {
    await retryFailedMedia(id);
    await refresh();
    toast.info("Mídia reenfileirada para nova tentativa.");
    onSync();
  };

  const handleRetryAll = async () => {
    await Promise.all(items.map((m) => retryFailedMedia(m.id)));
    await refresh();
    toast.info(`${items.length} mídia(s) reenfileirada(s).`);
    onSync();
  };

  const handleDiscard = async (id: string) => {
    // Remove SOMENTE a mídia da fila local — a visita remota permanece.
    await removePendingFoto(id);
    await refresh();
    toast.success("Mídia removida da fila local. A visita foi preservada.");
  };

  return (
    <div className="mx-4 my-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {items.length} mídia(s) não enviada(s)
        </div>
        <Button size="sm" variant="outline" onClick={handleRetryAll} disabled={syncing}>
          <RefreshCw className="mr-1 h-3 w-3" /> Reenviar tudo
        </Button>
      </div>

      <ul className="mt-2 space-y-2">
        {items.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium">{m.fileName}</p>
              <p className="truncate text-muted-foreground">
                {m.lastUploadError || "falha no envio"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => handleRetry(m.id)} disabled={syncing}>
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDiscard(m.id)}>
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
