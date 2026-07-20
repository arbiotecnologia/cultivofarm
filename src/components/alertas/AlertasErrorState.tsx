import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AlertasErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <AlertTriangle className="h-10 w-10 mb-3 text-destructive" />
      <p className="font-medium">Erro ao carregar alertas</p>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
