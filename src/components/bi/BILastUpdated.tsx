import { Button } from "@/components/ui/button";
import { RefreshCcw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BILastUpdatedProps {
  lastUpdated: Date;
  onUpdate: () => void;
  isLoading: boolean;
}

export function BILastUpdated({ lastUpdated, onUpdate, isLoading }: BILastUpdatedProps) {
  return (
    <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-full border shadow-sm self-start">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
        Última atualização: {format(lastUpdated, "HH:mm:ss", { locale: ptBR })}
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-5 w-5 rounded-full" 
        onClick={onUpdate}
        disabled={isLoading}
      >
        <RefreshCcw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
