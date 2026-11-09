import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { brl, fmtDate } from "@/lib/financial/format";
import type { SimulateResult } from "@/hooks/useSimulateB2BPaymentPlan";

interface Props {
  simulation: SimulateResult;
  cashReferenceAmount?: number | null;
  /** Nome já resolvido pelo chamador: vendedor autorizado (portal B2B) ou tenant ativo (interno). */
  responsavelNome?: string | null;
  /**
   * B2B_PAYMENT_CONDITION_V1: nome do meio quando o servidor marcou as parcelas como ESTIMADAS. Valores e parcelas vêm
   * sempre de `simulation` (uma verdade monetária); este rótulo só muda a apresentação das datas.
   */
  estimatedMethodLabel?: string | null;
}

export function PaymentSimulationSummary({ simulation, cashReferenceAmount, responsavelNome, estimatedMethodLabel }: Props) {
  const { amounts, warnings } = simulation;
  const schedule = simulation.schedule;
  const estimated = estimatedMethodLabel ? { methodLabel: estimatedMethodLabel } : null;
  const diffVsCash =
    cashReferenceAmount != null && cashReferenceAmount > 0
      ? amounts.final_amount - cashReferenceAmount
      : null;

  if (simulation.quote_required) {
    return (
      <div className="space-y-2 text-sm">
        <Alert className="py-2">
          <AlertDescription className="text-xs">
            Esta condição comercial é <strong>sob consulta</strong>. O pedido será enviado para
            cotação e o valor final será definido pela equipe comercial da {responsavelNome?.trim() || "empresa fornecedora"}.
          </AlertDescription>
        </Alert>
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <Alert key={i} className="py-2">
                <AlertDescription className="text-xs">{w}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border rounded-md p-2 bg-muted/20">

        <span className="text-muted-foreground">Valor de tabela</span>
        <span className="text-right">{brl(amounts.table_amount)}</span>
        <span className="text-muted-foreground">Desconto comercial</span>
        <span className="text-right text-emerald-600">− {brl(amounts.discount_amount)}</span>
        <span className="text-muted-foreground">Base líquida</span>
        <span className="text-right">{brl(amounts.net_amount_after_discount)}</span>
        {amounts.financial_interest_amount > 0 && (
          <>
            <span className="text-muted-foreground">Juros financeiros</span>
            <span className="text-right text-amber-600">+ {brl(amounts.financial_interest_amount)}</span>
          </>
        )}
        {diffVsCash != null && diffVsCash !== 0 && (
          <>
            <span className="text-xs text-muted-foreground">vs. à vista</span>
            <span className={`text-right text-xs ${diffVsCash > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {diffVsCash > 0 ? "+" : ""}{brl(diffVsCash)}
            </span>
          </>
        )}
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="schedule">
          <AccordionTrigger className="text-xs py-2">
            {estimated ? `Parcelas estimadas · ${estimated.methodLabel} (${schedule.length})` : `Parcelas estimadas (${schedule.length})`}
          </AccordionTrigger>
          <AccordionContent>
            {/* Antes da NF nenhuma data é definitiva, inclusive no contrato legado. */}
            <p className="text-[11px] text-muted-foreground mb-1" data-testid="b2b-estimated-dates-note">
              Datas estimadas. O vencimento definitivo é contado a partir da emissão da nota fiscal.
            </p>
            <div className="space-y-1">
              {schedule.map((s) => (
                <div key={s.installment_number} className="flex justify-between text-xs border-b py-1 last:border-0">
                  <span>Parcela {s.installment_number} · previsão {fmtDate(s.due_date)}</span>
                  <span className="font-medium">{brl(s.amount)}</span>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <Alert key={i} className="py-2">
              <AlertDescription className="text-xs">{w}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}
