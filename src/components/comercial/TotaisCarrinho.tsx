import { brl } from "@/lib/financial/format";
import { cn } from "@/lib/utils";
import { formatarPercentual } from "@/lib/catalogo/formatUnidades";

interface Props {
  subtotalCheio: number;
  totalFinal: number;
  /** Rótulo opcional do total final. Padrão: "Total a pagar". */
  labelTotal?: string;
  /** Juros financeiros embutidos no total (quando houver). */
  jurosValor?: number;
  /** Nome da condição comercial aplicada, exibido ao lado do total. */
  condicaoLabel?: string;
  /** Variação compacta para uso em diálogos. */
  compact?: boolean;
  className?: string;
}

/** Rodapé padronizado: Subtotal • Desconto (-N%) • Juros • Total a pagar. */
export function TotaisCarrinho({
  subtotalCheio,
  totalFinal,
  labelTotal = "Total a pagar",
  jurosValor,
  condicaoLabel,
  compact,
  className,
}: Props) {
  const cheio = Math.max(0, Number(subtotalCheio) || 0);
  const final = Math.max(0, Number(totalFinal) || 0);
  const juros = Math.max(0, Number(jurosValor) || 0);
  const desconto = Math.max(0, cheio + juros - final);
  const pct = cheio > 0 ? (desconto / cheio) * 100 : 0;
  const hasDiscount = desconto > 0.005;
  const hasJuros = juros > 0.005;

  return (
    <div className={cn("border-t pt-2 space-y-1", compact ? "text-xs" : "text-sm", className)}>
      {(hasDiscount || hasJuros) && (
        <>
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{brl(cheio)}</span>
          </div>
          {hasDiscount && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>Desconto ({`−${formatarPercentual(pct)}`})</span>
              <span>−{brl(desconto)}</span>
            </div>
          )}
          {hasJuros && (
            <div className="flex justify-between text-amber-600 dark:text-amber-400">
              <span>Juros financeiros</span>
              <span>+{brl(juros)}</span>
            </div>
          )}
        </>
      )}
      <div className={cn("flex justify-between gap-2 font-bold", compact ? "text-sm" : "text-base")}>
        <span className="min-w-0">
          {labelTotal}
          {condicaoLabel && (
            <span className="block text-xs font-normal text-muted-foreground truncate">{condicaoLabel}</span>
          )}
        </span>
        <span className="whitespace-nowrap">{brl(final)}</span>
      </div>
    </div>
  );
}
