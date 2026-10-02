import { useEffect, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyPendingUpdate,
  dismissPendingUpdate,
  getPwaUpdateSnapshot,
  PWA_UPDATE_STATE_EVENT,
  reopenPendingUpdate,
  retryCurrentBuild,
  type PwaUpdateSnapshot,
} from "./registerSW";

export function PwaUpdateNotifier() {
  const [update, setUpdate] = useState<PwaUpdateSnapshot>(getPwaUpdateSnapshot);

  useEffect(() => {
    const onStateChange = (event: Event) => {
      setUpdate((event as CustomEvent<PwaUpdateSnapshot>).detail);
    };
    window.addEventListener(PWA_UPDATE_STATE_EVENT, onStateChange);
    setUpdate(getPwaUpdateSnapshot());
    return () => window.removeEventListener(PWA_UPDATE_STATE_EVENT, onStateChange);
  }, []);

  if (update.status === "hidden") return null;

  if (update.status === "deferred_badge") {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={reopenPendingUpdate}
        aria-label="Nova versão disponível. Clique para atualizar."
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-3 z-40 h-10 max-w-[calc(100vw-1.5rem)] gap-2 border border-border bg-card px-3 text-card-foreground shadow-lg sm:bottom-5 sm:right-5"
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4 text-primary" />
        <span className="truncate text-xs font-semibold">Nova versão disponível</span>
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" />
      </Button>
    );
  }

  const applying = update.status === "applying";
  const error = update.status === "error";

  return (
    <section
      role={error ? "alert" : "status"}
      aria-live="polite"
      aria-label="Atualização do Cultivo Farm"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 border border-border bg-card p-4 text-card-foreground shadow-xl sm:bottom-5 sm:left-auto sm:right-5 sm:w-[24rem]"
    >
      <div className="flex items-start gap-3">
        {applying ? (
          <Loader2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
        ) : error ? (
          <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        ) : (
          <RefreshCw aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            {update.staleBuild ? "Há uma atualização necessária para continuar." : "Nova versão disponível"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {update.message ?? (applying
              ? "Preparando a nova versão…"
              : "Há uma atualização do Cultivo Farm pronta para instalar.")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {error && update.staleBuild && (
          <Button type="button" variant="outline" size="sm" onClick={() => retryCurrentBuild()}>
            Tentar novamente
          </Button>
        )}
        {!applying && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={dismissPendingUpdate}
          >
            {error ? "Continuar depois" : "Adiar"}
          </Button>
        )}
        <Button type="button" size="sm" onClick={() => void applyPendingUpdate()} disabled={applying}>
          {applying ? "Atualizando…" : "Atualizar agora"}
        </Button>
      </div>
    </section>
  );
}