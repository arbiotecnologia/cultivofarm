import { brl } from "@/lib/financial/format";
import { cn } from "@/lib/utils";
import { formatarPercentual } from "@/lib/catalogo/formatUnidades";

interface Props {
  subtotalCheio: number;
  totalFinal: number;
  /** Rótulo opcional do total final. Padrão: "Total a pagar". */
  labelTotal?: string;
  /** Variação compacta para uso em diálogos. */
  compact?: boolean;
  className?: string;
}

/** Rodapé padronizado: Subtotal • Desconto (-N%) • Total a pagar. */
export function TotaisCarrinho({ subtotalCheio, totalFinal, labelTotal = "Total a pagar", compact, className }: Props) {
  const cheio = Math.max(0, Number(subtotalCheio) || 0);
  const final = Math.max(0, Number(totalFinal) || 0);
  const desconto = Math.max(0, cheio - final);
  const pct = cheio > 0 ? (desconto / cheio) * 100 : 0;
  const hasDiscount = desconto > 0.005;

  return (
    <div className={cn("border-t pt-2 space-y-1", compact ? "text-xs" : "text-sm", className)}>
      {hasDiscount && (
        <>
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{brl(cheio)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
            <span>Desconto ({`−${formatarPercentual(pct)}`})</span>
            <span>−{brl(desconto)}</span>
          </div>
        </>
      )}
      <div className={cn("flex justify-between font-bold", compact ? "text-sm" : "text-base")}>
        <span>{labelTotal}</span>
        <span>{brl(final)}</span>
      </div>
    </div>
  );
}
