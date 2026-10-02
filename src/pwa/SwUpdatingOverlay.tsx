import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  finishUpdate,
  isServiceWorkerUpdateInProgress,
  PWA_UPDATING_END,
  PWA_UPDATING_START,
} from "./registerSW";

const VISUAL_SAFETY_TIMEOUT_MS = 15000;

export function SwUpdatingOverlay() {
  const [visible, setVisible] = useState(isServiceWorkerUpdateInProgress);

  useEffect(() => {
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    window.addEventListener(PWA_UPDATING_START, show);
    window.addEventListener(PWA_UPDATING_END, hide);
    return () => {
      window.removeEventListener(PWA_UPDATING_START, show);
      window.removeEventListener(PWA_UPDATING_END, hide);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const safetyTimer = window.setTimeout(() => {
      setVisible(false);
      finishUpdate("overlay-safety-timeout");
    }, VISUAL_SAFETY_TIMEOUT_MS);
    return () => {
      window.clearTimeout(safetyTimer);
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div>
          <p className="text-lg font-semibold text-foreground">
            Atualizando aplicação…
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Aguarde, a página será recarregada automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
