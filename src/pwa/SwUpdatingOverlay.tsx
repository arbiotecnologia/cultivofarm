import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { isServiceWorkerUpdateInProgress } from "./registerSW";

export const SW_UPDATING_EVENT = "pwa:updating-start";

export function SwUpdatingOverlay() {
  const [visible, setVisible] = useState(isServiceWorkerUpdateInProgress);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener(SW_UPDATING_EVENT, handler);
    return () => window.removeEventListener(SW_UPDATING_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
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
