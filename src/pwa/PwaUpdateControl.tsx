import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  getPwaUpdateSnapshot,
  inspectPublishedVersion,
  PWA_UPDATE_STATE_EVENT,
  type PwaUpdateSnapshot,
} from "./registerSW";

const checkedSessionKeys = new Set<string>();

export function resetPwaUpdateControlForTests(): void {
  checkedSessionKeys.clear();
}

export function PwaUpdateControl() {
  const { user, session } = useAuth();
  const [update, setUpdate] = useState<PwaUpdateSnapshot>(getPwaUpdateSnapshot);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    const onStateChange = (event: Event) => {
      setUpdate((event as CustomEvent<PwaUpdateSnapshot>).detail);
    };
    window.addEventListener(PWA_UPDATE_STATE_EVENT, onStateChange);
    setUpdate(getPwaUpdateSnapshot());
    return () => window.removeEventListener(PWA_UPDATE_STATE_EVENT, onStateChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    const sessionKey = `${user.id}:${session?.expires_at ?? "active"}`;
    if (checkedSessionKeys.has(sessionKey)) return;
    checkedSessionKeys.add(sessionKey);
    void inspectPublishedVersion();
  }, [session?.expires_at, user]);

  const checkManually = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const result = await inspectPublishedVersion();
      if (result.status === "current") toast.success("Você já está na versão mais recente.");
      if (result.status === "offline") toast.error("Sem conexão. Não foi possível verificar atualizações.");
      if (result.status === "error") toast.error("Não foi possível verificar a atualização agora.");
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  if (!user || update.status !== "hidden") return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void checkManually()}
      disabled={checking}
      aria-label="Verificar se há nova versão do Cultivo Farm"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-3 z-30 max-w-[calc(100vw-1.5rem)] border border-border bg-card text-card-foreground shadow-lg sm:bottom-5 sm:right-5"
    >
      {checking ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
      <span>{checking ? "Verificando…" : "Verificar atualização"}</span>
    </Button>
  );
}