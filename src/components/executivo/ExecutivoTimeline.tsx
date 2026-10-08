import { Card } from "@/components/ui/card";
import { Activity } from "lucide-react";
import type { TimelineEvento } from "@/hooks/useExecutivoTimeline";

interface Props {
  eventos: TimelineEvento[];
  isLoading: boolean;
  indisponiveis: string[];
  motivo?: string | null;
  hasError?: boolean;
}

export function ExecutivoTimeline({ eventos, isLoading, indisponiveis, motivo, hasError }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Timeline operacional</h2>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : hasError || indisponiveis.length > 0 ? (
        <p role="status" className="text-xs text-muted-foreground">
          Timeline indisponível. {hasError ? "Não foi possível consultar os eventos." : motivo ?? "Fontes sem vínculo organizacional comprovado."}
        </p>
      ) : eventos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem eventos recentes.</p>
      ) : (
        <ol className="relative border-l pl-4 space-y-3 max-h-[480px] overflow-y-auto">
          {eventos.map((e, i) => (
            <li key={i} className="text-xs">
              <div className="absolute -left-[5px] mt-1 h-2 w-2 rounded-full bg-primary" />
              <div className="font-medium">{e.descricao}</div>
              <div className="text-muted-foreground">
                {new Date(e.data_evento).toLocaleString("pt-BR")} · {e.modulo}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
