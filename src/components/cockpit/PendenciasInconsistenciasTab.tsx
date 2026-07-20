import { useMemo, useState } from "react";
import { usePendenciasEsteira } from "@/hooks/usePendenciasEsteira";
import { InconsistenciaCard } from "./InconsistenciaCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PendenciasInconsistenciasTab() {
  const { inconsistencias } = usePendenciasEsteira();
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return inconsistencias;
    return inconsistencias.filter(i => i.gravidade === filter);
  }, [inconsistencias, filter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Buscar por cliente ou OS..." className="max-w-xs" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Gravidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
        {/* Seção Crítica */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-red-600 uppercase tracking-wider flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            Bloqueios Críticos (Impedem Finalização)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filtered.filter(i => i.gravidade === 'critica' || i.gravidade === 'alta').map(i => (
              <InconsistenciaCard key={i.id} inconsistencia={i} />
            ))}
            {filtered.filter(i => i.gravidade === 'critica' || i.gravidade === 'alta').length === 0 && (
              <div className="col-span-full p-4 border border-dashed rounded-lg text-center text-muted-foreground text-xs italic">
                Nenhum bloqueio crítico na esteira.
              </div>
            )}
          </div>
        </div>

        {/* Seção Informativa */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-600" />
            Pendências Informativas (Pós-Entrega)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filtered.filter(i => i.gravidade !== 'critica' && i.gravidade !== 'alta').map(i => (
              <InconsistenciaCard key={i.id} inconsistencia={i} />
            ))}
            {filtered.filter(i => i.gravidade !== 'critica' && i.gravidade !== 'alta').length === 0 && (
              <div className="col-span-full p-4 border border-dashed rounded-lg text-center text-muted-foreground text-xs italic">
                Nenhuma pendência informativa.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
