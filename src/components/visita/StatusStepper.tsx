import { Check, Circle, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_ORDER,
  STATUS_LABEL_REGISTRO,
  type RegistroStatus,
} from "@/lib/registroTransitions";

interface StatusStepperProps {
  current: RegistroStatus | string | undefined | null;
  /** "compact" mostra chips em linha sem labels (para tabelas); "full" mostra labels. */
  variant?: "full" | "compact";
  className?: string;
}

/**
 * Régua visual dos 5 estados canônicos do fluxo de registros do consultor.
 * Marca o passo atual em destaque, anteriores como concluídos, próximos pendentes.
 */
export function StatusStepper({ current, variant = "full", className }: StatusStepperProps) {
  const isArquivado = current === "arquivado";
  const currentIdx = isArquivado ? -1 : STATUS_ORDER.indexOf(current as RegistroStatus);

  if (isArquivado) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
      >
        <Archive className="h-3.5 w-3.5" />
        <span>{STATUS_LABEL_REGISTRO.arquivado}</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("inline-flex items-center gap-0.5", className)} aria-label="Etapa do fluxo">
        {STATUS_ORDER.map((step, i) => {
          const isDone = currentIdx > i;
          const isCurrent = currentIdx === i;
          return (
            <span
              key={step}
              title={STATUS_LABEL_REGISTRO[step]}
              className={cn(
                "h-1.5 w-4 rounded-full transition-colors",
                isCurrent && "bg-primary",
                isDone && "bg-primary/60",
                !isCurrent && !isDone && "bg-muted",
              )}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/50 p-3",
        className,
      )}
      aria-label="Etapas do fluxo do registro"
    >
      <div className="flex items-start justify-between gap-1">
        {STATUS_ORDER.map((step, i) => {
          const isDone = currentIdx > i;
          const isCurrent = currentIdx === i;
          const isPending = currentIdx < i;
          return (
            <div key={step} className="flex flex-1 flex-col items-center text-center min-w-0">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  isDone && "border-primary/60 bg-primary/60 text-primary-foreground",
                  isPending && "border-muted bg-background text-muted-foreground",
                )}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-[10px] font-bold">{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "mt-1 text-[10px] leading-tight truncate w-full",
                  isCurrent && "font-semibold text-foreground",
                  isDone && "text-muted-foreground",
                  isPending && "text-muted-foreground/70",
                )}
              >
                {STATUS_LABEL_REGISTRO[step]}
              </span>
            </div>
          );
        })}
      </div>
      {currentIdx < 0 && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Circle className="h-3 w-3" /> Status desconhecido
        </p>
      )}
    </div>
  );
}
