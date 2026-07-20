import type { AlertaOperacional } from "@/hooks/useAlertasOperacionais";
import { AlertaCard } from "./AlertaCard";
import { AlertasEmptyState } from "./AlertasEmptyState";

interface Props {
  alertas: AlertaOperacional[];
  onOpen: (a: AlertaOperacional) => void;
  lidoIds?: Set<string>;
}

export function AlertasLista({ alertas, onOpen, lidoIds }: Props) {
  if (alertas.length === 0) return <AlertasEmptyState />;
  return (
    <div className="space-y-3">
      {alertas.map((a) => (
        <AlertaCard
          key={a.id}
          alerta={a}
          onOpen={onOpen}
          lido={lidoIds ? lidoIds.has(a.id) : undefined}
        />
      ))}
    </div>
  );
}
