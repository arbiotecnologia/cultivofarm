import { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { inspectPublishedVersion } from "./registerSW";

export function PwaManualCheckButton() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const checkManually = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const result = await inspectPublishedVersion(fetch, "manual");
      if (result.status === "current") toast.success("Você já está na versão mais recente.");
      if (result.status === "offline") toast.error("Sem conexão. Não foi possível verificar atualizações.");
      if (result.status === "error") toast.error("Não foi possível verificar a atualização agora.");
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  if (!user) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void checkManually()}
          disabled={checking}
          aria-label="Verificar se há nova versão do Cultivo Farm"
          className="h-9 w-9 shrink-0 cursor-pointer px-0"
        >
          {checking ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Verificar atualização</TooltipContent>
    </Tooltip>
  );
}