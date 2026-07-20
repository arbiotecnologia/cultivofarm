import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { triggerSafeReload } from "./registerSW";
import { SW_UPDATING_EVENT } from "./SwUpdatingOverlay";

export const SW_UPDATE_EVENT = "pwa:update-available";
const RELOAD_FALLBACK_MS = 4000;

export function SwUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const sw = (e as CustomEvent<ServiceWorker>).detail;
      if (sw) setWaiting(sw);
    };
    window.addEventListener(SW_UPDATE_EVENT, handler);
    return () => window.removeEventListener(SW_UPDATE_EVENT, handler);
  }, []);

  const open = waiting !== null;

  const handleUpdate = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!waiting) return;
    const sw = waiting;
    setWaiting(null);
    window.dispatchEvent(new CustomEvent(SW_UPDATING_EVENT));
    sw.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(() => triggerSafeReload(), RELOAD_FALLBACK_MS);
  };

  const handleLater = () => setWaiting(null);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && handleLater()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Nova versão disponível</AlertDialogTitle>
          <AlertDialogDescription>
            Recarregaremos a página para aplicar as melhorias mais recentes.
            Seu trabalho não salvo pode ser perdido.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLater}>Depois</AlertDialogCancel>
          <AlertDialogAction onClick={handleUpdate}>
            Atualizar agora
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
