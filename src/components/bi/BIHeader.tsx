import { BarChart3, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BILastUpdated } from "./BILastUpdated";
import { BIExportButton } from "./BIExportButton";

interface BIHeaderProps {
  lastUpdated: Date;
  loading: boolean;
  onUpdate: () => void;
}

export function BIHeader({ lastUpdated, loading, onUpdate }: BIHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
          <BarChart3 className="h-8 w-8 text-primary" />
          BI Operacional Cultivo Farm
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          Indicadores reais de visitas, produção, qualidade e logística.
        </p>
      </div>
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        <BILastUpdated 
          lastUpdated={lastUpdated} 
          isLoading={loading} 
          onUpdate={onUpdate} 
        />
      </div>
    </div>
  );
}
