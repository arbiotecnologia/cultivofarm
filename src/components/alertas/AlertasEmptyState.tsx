import { BellOff } from "lucide-react";

export function AlertasEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
      <BellOff className="h-10 w-10 mb-3 opacity-60" />
      <p className="font-medium">Nenhum alerta encontrado</p>
      <p className="text-sm">Não há alertas para os filtros aplicados.</p>
    </div>
  );
}
