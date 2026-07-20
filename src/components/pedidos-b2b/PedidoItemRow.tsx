import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { brl } from "@/lib/financial/format";
import { fmtL } from "@/lib/envaseFormat";
import { PedidoItemProdutoInfo } from "./PedidoItemProdutoInfo";

export function formatUnidade(u: string): string {
  switch (u) {
    case "dose":
      return "dose 100 mL";
    case "litro":
      return "L";
    case "hectare":
      return "ha";
    case "unidade":
      return "un";
    default:
      return u || "";
  }
}

/**
 * Reconcilia unit/desconto/subtotal a partir dos campos persistidos.
 * Fonte da verdade: preco_tabela_snapshot (cheio) e desconto_percentual.
 * final = cheio * (1 - desc/100); subtotal = final * qtd.
 * Usa fallback para `valor_unitario_cheio` (usado por partner_simulation_items).
 */
export function reconcileItem(it: any) {
  const qtd = Number(it.quantidade ?? 0);
  const cheioRaw = Number(
    it.preco_tabela_snapshot ?? it.valor_unitario_cheio ?? 0,
  );
  const finalRaw = Number(it.preco_unitario ?? 0);
  const descPctRaw = Number(it.desconto_percentual ?? 0);
  const subtotalRaw = Number(it.subtotal ?? 0);

  const cheio = cheioRaw > 0 ? cheioRaw : finalRaw;
  const descPct =
    descPctRaw > 0
      ? descPctRaw
      : cheio > 0 && finalRaw > 0 && finalRaw < cheio
        ? ((cheio - finalRaw) / cheio) * 100
        : 0;
  const finalEsperado = cheio * (1 - descPct / 100);
  const subtotalEsperado = finalEsperado * qtd;

  const issues: string[] = [];
  const tol = 0.02;
  if (cheio > 0 && finalRaw > 0 && Math.abs(finalRaw - finalEsperado) > tol) {
    issues.push(
      `Unitário persistido (${brl(finalRaw)}) diverge do esperado ${brl(finalEsperado)} (cheio ${brl(cheio)} − ${descPct.toFixed(2)}%).`,
    );
  }
  if (
    subtotalRaw > 0 &&
    Math.abs(subtotalRaw - subtotalEsperado) > tol * Math.max(1, qtd)
  ) {
    issues.push(
      `Subtotal persistido (${brl(subtotalRaw)}) diverge do esperado ${brl(subtotalEsperado)}.`,
    );
  }

  return {
    qtd,
    cheio,
    final: finalRaw > 0 ? finalRaw : finalEsperado,
    descPct,
    subtotal: subtotalRaw > 0 ? subtotalRaw : subtotalEsperado,
    subtotalCheio: cheio * qtd,
    economia: Math.max(
      0,
      (cheio - (finalRaw > 0 ? finalRaw : finalEsperado)) * qtd,
    ),
    issues,
  };
}

interface Props {
  item: any;
  showDiscountCol: boolean;
  /** Se true, oculta a coluna de desconto e o preço riscado (modo orçamento/tabela). */
  tableModeOnly?: boolean;
}

export function PedidoItemRow({ item: it, showDiscountCol, tableModeOnly = false }: Props) {
  const um = String(it.unidade_medida ?? "");
  const volumeMl = Number(it.volume_ml ?? 0);
  const unitLabel =
    um === "unidade" && volumeMl > 0 ? fmtL(volumeMl) : formatUnidade(um);
  const {
    qtd,
    cheio,
    descPct,
    subtotal,
    subtotalCheio,
    economia,
    issues,
  } = reconcileItem(it);

  const showDiscount = showDiscountCol && !tableModeOnly;

  return (
    <TableRow>
      <TableCell className="text-sm align-middle">
        <PedidoItemProdutoInfo
          item={it}
          showTipoBadge
          afterName={
            issues.length > 0 ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="destructive"
                      className="text-[10px] py-0 gap-1 cursor-help"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Inconsistência
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <ul className="list-disc pl-4 space-y-1">
                      {issues.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null
          }
        />
      </TableCell>
      {(() => {
        // Unidade "natural" da quantidade (sem embutir tamanho da embalagem)
        const qtdUnitLabel =
          um === "unidade" && volumeMl > 0 ? "un" : formatUnidade(um);
        // Volume = vasilhame escolhido no carrinho; Volume total = qtd × vasilhame
        let vasilhameLabel: string | null = null;
        let volumeTotalLabel: string | null = null;
        if (um === "unidade" && volumeMl > 0) {
          vasilhameLabel = fmtL(volumeMl);
          volumeTotalLabel = fmtL(qtd * volumeMl);
        } else if (um === "dose") {
          vasilhameLabel = "100 mL";
          volumeTotalLabel = fmtL(qtd * 100);
        } else if (um === "litro") {
          vasilhameLabel = null;
          volumeTotalLabel = fmtL(qtd * 1000);
        }
        return (
          <>
            <TableCell className="text-right align-middle">
              {qtd.toLocaleString("pt-BR")}
              {qtdUnitLabel && (
                <span className="text-[11px] text-muted-foreground"> {qtdUnitLabel}</span>
              )}
            </TableCell>
            <TableCell className="text-right align-middle">
              {vasilhameLabel ? (
                <span className="font-medium">{vasilhameLabel}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right align-middle">
              {volumeTotalLabel ? (
                <span className="font-medium">{volumeTotalLabel}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </>
        );
      })()}


      <TableCell className="text-right align-middle">
        <div>{brl(cheio)}</div>
        {unitLabel && (
          <div className="text-[11px] text-muted-foreground">/{unitLabel}</div>
        )}
      </TableCell>
      {showDiscount && (
        <TableCell className="text-right align-middle">
          {descPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
          {economia > 0 && (
            <div className="text-[11px] text-muted-foreground">
              −{brl(economia)}
            </div>
          )}
        </TableCell>
      )}
      <TableCell className="text-right align-middle">
        <div className="font-semibold">
          {brl(tableModeOnly ? subtotalCheio : subtotal)}
        </div>
        {!tableModeOnly && descPct > 0 && subtotalCheio > subtotal && (
          <div className="text-[11px] text-muted-foreground line-through">
            {brl(subtotalCheio)}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
