import { AlertTriangle } from "lucide-react";
import { BIEmptyState } from "../BIEmptyState";

interface GargaloResumo {
  tipo: string;
  count: number;
  gravidade: string;
}

interface BIGargalosVisitasProps {
  dados: any[];
  loading?: boolean;
}

export function BIGargalosVisitas({ dados, loading }: BIGargalosVisitasProps) {
  if (loading) return <div className="h-24 w-full bg-muted animate-pulse rounded-lg" />;
  
  const visitasGargalos = (dados || []).filter(d => d.origem === "Visita");
  
  if (visitasGargalos.length === 0) {
    return <BIEmptyState mensagem="Nenhum gargalo técnico identificado nas visitas." />;
  }

  // Agrupar por tipo
  const map = new Map<string, GargaloResumo>();
  
  visitasGargalos.forEach((curr: any) => {
    if (!map.has(curr.tipo)) {
      map.set(curr.tipo, { tipo: curr.tipo, count: 0, gravidade: curr.gravidade });
    }
    const item = map.get(curr.tipo)!;
    item.count++;
  });

  const resumo = Array.from(map.values()).sort((a: GargaloResumo, b: GargaloResumo) => {
    const order: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
    return (order[a.gravidade] ?? 4) - (order[b.gravidade] ?? 4) || b.count - a.count;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {resumo.map((g: GargaloResumo) => (
        <div key={g.tipo} className="bg-white p-3 rounded-lg border shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${
              g.gravidade === 'critica' ? 'bg-red-100 text-red-600' : 
              g.gravidade === 'alta' ? 'bg-orange-100 text-orange-600' : 
              'bg-blue-100 text-blue-600'
            }`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold capitalize leading-tight">{g.tipo.replace(/_/g, " ")}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{g.gravidade}</span>
            </div>
          </div>
          <div className="text-xl font-black text-foreground">{g.count}</div>
        </div>
      ))}
    </div>
  );
}
