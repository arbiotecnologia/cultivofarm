import type { AlertaResumido } from "@/hooks/useAlertasResumo";
import { AlertaGravidadeBadge } from "./AlertaGravidadeBadge";
import { AlertaOrigemBadge } from "./AlertaOrigemBadge";
import { formatDateDisplay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface Props {
  alertas: AlertaResumido[];
  lidoIds?: Set<string>;
  onSelect?: (id: string) => void;
  emptyLabel?: string;
}

export function AlertasMiniList({
  alertas,
  lidoIds,
  onSelect,
  emptyLabel = "Nenhum alerta no momento.",
}: Props) {
  if (!alertas.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">{emptyLabel}</p>
    );
  }
  return (
    <ul className="divide-y">
      {alertas.map((a) => {
        const lido = lidoIds?.has(a.id);
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onSelect?.(a.id)}
              className={cn(
                "w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors",
                !lido && "bg-primary/5"
              )}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <AlertaGravidadeBadge gravidade={a.gravidade} />
                <AlertaOrigemBadge origem={a.origem} />
                {!lido && (
                  <span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lido" />
                )}
              </div>
              <p className="text-sm font-medium truncate">{a.titulo}</p>
              {a.proxima_acao && (
                <p className="text-xs text-muted-foreground truncate">{a.proxima_acao}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDateDisplay(a.created_at)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
