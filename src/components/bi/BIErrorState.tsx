import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BIErrorStateProps {
  mensagem?: string;
  onRetry?: () => void;
}

export function BIErrorState({ 
  mensagem = "Ocorreu um erro ao carregar os indicadores.", 
  onRetry 
}: BIErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-red-50 rounded-xl border border-red-100">
      <div className="bg-red-100 p-3 rounded-full mb-4">
        <AlertCircle className="h-6 w-6 text-red-600" />
      </div>
      <h3 className="text-lg font-bold text-red-900 mb-1">Ops! Algo deu errado</h3>
      <p className="text-sm text-red-700 max-w-md mb-4">
        {mensagem}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 border-red-200 text-red-700 hover:bg-red-100">
          <RefreshCcw className="h-4 w-4" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
