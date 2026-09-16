import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw } from "lucide-react";

interface ErrorRecoveryProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onSignOut?: () => void;
}

export function ErrorRecovery({ 
  title = "Ops! Algo deu errado", 
  message = "Não foi possível carregar os dados do painel. Isso pode ser devido a uma falha de conexão ou falta de permissões.",
  onRetry,
  onSignOut
}: ErrorRecoveryProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card border rounded-lg shadow-lg p-6 text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center text-destructive">
            <AlertCircle size={32} />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">
            {message}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center pt-4">
          {onRetry && (
            <Button onClick={onRetry} className="flex items-center gap-2">
              <RefreshCcw size={16} />
              Tentar Novamente
            </Button>
          )}
          {onSignOut && (
            <Button variant="outline" onClick={onSignOut}>
              Sair da Conta
            </Button>
          )}
        </div>
        
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          Cultivo Farm
        </p>
      </div>
    </div>
  );
}
