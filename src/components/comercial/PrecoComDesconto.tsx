import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import { cn } from "@/lib/utils";

export interface PrecoComDescontoProps {
  /** Preço cheio (sem desconto), por unidade exibida. Quando ausente/igual ao final, exibe apenas o final. */
  valorCheio?: number | null;
  /** Preço com desconto aplicado. */
  valorFinal: number;
  /** Desconto efetivo em %. Quando 0, layout colapsa para uma única linha. */
  descontoPct?: number | null;
  /** Sufixo curto (ex.: "/ha", "/un", "/L", "/dose"). */
  unidadeLabel?: string;
  size?: "sm" | "md" | "lg";
  align?: "start" | "end";
  mostrarChip?: boolean;
  className?: string;
}

const SIZE = {
  sm: { final: "text-sm font-semibold", cheio: "text-[10px]", chip: "h-4 text-[10px] px-1.5" },
  md: { final: "text-base font-semibold", cheio: "text-xs", chip: "h-4 text-[10px] px-1.5" },
  lg: { final: "text-2xl font-bold", cheio: "text-sm", chip: "h-5 text-xs px-2" },
} as const;

/** Padrão visual único para preço com desconto B2B (cheio riscado em cima, final em destaque embaixo). */
export function PrecoComDesconto({
  valorCheio,
  valorFinal,
  descontoPct,
  unidadeLabel,
  size = "md",
  align = "start",
  mostrarChip = true,
  className,
}: PrecoComDescontoProps) {
  const styles = SIZE[size];
  const pct = Number(descontoPct ?? 0);
  const cheio = valorCheio != null ? Number(valorCheio) : null;
  const hasDiscount = pct > 0.01 && cheio != null && cheio > valorFinal + 0.005;

  if (valorFinal <= 0) {
    return <span className={cn("text-xs text-muted-foreground italic", className)}>Sob consulta</span>;
  }

  return (
    <div className={cn("flex flex-col leading-tight", align === "end" ? "items-end" : "items-start", className)}>
      {hasDiscount && (
        <span className={cn(styles.cheio, "text-muted-foreground line-through")}>
          {brl(cheio!)}
          {unidadeLabel && <span className="ml-0.5">{unidadeLabel}</span>}
        </span>
      )}
      <span className="flex items-baseline gap-1.5">
        <span className={styles.final}>
          {brl(valorFinal)}
          {unidadeLabel && <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{unidadeLabel}</span>}
        </span>
        {hasDiscount && mostrarChip && (
          <Badge variant="secondary" className={cn(styles.chip, "px-1.5")}>
            −{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%
          </Badge>
        )}
      </span>
    </div>
  );
}

/** Deriva preço cheio a partir do final + desconto. Retorna `final` quando desconto for 0. */
export function cheioFromFinal(final: number, descontoPct?: number | null): number {
  const pct = Number(descontoPct ?? 0);
  if (!Number.isFinite(final) || final <= 0) return 0;
  if (pct <= 0.0001 || pct >= 100) return final;
  return Number((final / (1 - pct / 100)).toFixed(2));
}
