import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export const PROFILE_LOAD_ERROR_MESSAGE = "Não foi possível carregar a ficha técnica";

export function ProfileLoadErrorState({ onRetry, busy = false }: { onRetry: () => void; busy?: boolean }) {
  return (
    <div role="alert" className="space-y-3 py-8 text-center">
      <AlertTriangle className="h-5 w-5 mx-auto text-destructive" />
      <p className="text-sm">{PROFILE_LOAD_ERROR_MESSAGE}</p>
      <p className="text-xs text-muted-foreground">
        Nenhuma edição é permitida enquanto os dados não forem carregados com segurança.
      </p>
      <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>
        {busy ? "Tentando novamente…" : "Tentar novamente"}
      </Button>
    </div>
  );
}
