import { Info } from "lucide-react";

interface BIEmptyStateProps {
  titulo?: string;
  mensagem?: string;
}

export function BIEmptyState({ 
  titulo = "Ainda não há dados suficientes", 
  mensagem = "Os números serão exibidos conforme o fluxo operacional for utilizado no sistema." 
}: BIEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-muted/30 rounded-xl border-2 border-dashed border-muted">
      <div className="bg-muted p-3 rounded-full mb-4">
        <Info className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-1">{titulo}</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {mensagem}
      </p>
    </div>
  );
}
