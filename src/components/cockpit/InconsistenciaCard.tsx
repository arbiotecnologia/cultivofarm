import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, Target, ArrowRight } from "lucide-react";
import { Inconsistencia } from "@/hooks/usePendenciasEsteira";

interface Props {
  inconsistencia: Inconsistencia;
}

export function InconsistenciaCard({ inconsistencia }: Props) {
  const getGravidadeColor = (g: string) => {
    switch (g) {
      case "critica": return "bg-red-500";
      case "alta": return "bg-orange-500";
      case "media": return "bg-yellow-500";
      default: return "bg-blue-500";
    }
  };

  return (
    <Card className="mb-2">
      <CardContent className="p-3 flex items-start gap-3">
        <div className={`mt-1 p-2 rounded-full text-white ${getGravidadeColor(inconsistencia.gravidade)}`}>
          <AlertTriangle size={16} />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold text-sm">{inconsistencia.tipo}</span>
            <Badge variant="outline" className="text-xs">OS {inconsistencia.os_id.substring(0, 8)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {inconsistencia.cliente} - {inconsistencia.fazenda} ({inconsistencia.produto})
          </p>
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock size={12} /> {inconsistencia.tempo_parado_horas}h parado
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs">
              Resolver <ArrowRight size={12} className="ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
