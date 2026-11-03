import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import { cn } from "@/lib/utils";
import type { CommercialPaymentPlan } from "@/hooks/useCommercialPaymentPlans";
import { formatarPercentual } from "@/lib/catalogo/formatUnidades";

interface Props {
  plans: CommercialPaymentPlan[];
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  finalAmountByPlan?: Record<string, number>;
  loading?: boolean;
  /** Carregamento da lista de condições publicadas para a empresa. */
  plansLoading?: boolean;
}

export function PaymentPlanSelector({ plans, selectedPlanId, onSelect, finalAmountByPlan, loading, plansLoading }: Props) {
  if (plansLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-md border border-border bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!plans.length) {
    return (
      <div role="status" className="rounded-md border border-dashed border-border p-3 space-y-1">
        <p className="text-sm font-medium">Nenhuma condição comercial disponível</p>
        <p className="text-sm text-muted-foreground">
          Nenhuma condição comercial está disponível para sua empresa. Entre em contato com o setor
          comercial.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {plans.map((p) => {
        const selected = selectedPlanId === p.id;
        const finalAmount = finalAmountByPlan?.[p.id];
        return (
          <Card
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(p.id)}
            className={cn(
              "p-3 cursor-pointer transition-colors border-2 space-y-1.5",
              selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm leading-tight">{p.name}</div>
              {p.plan_type === "cash" && (
                <Badge variant="default" className="text-[10px] shrink-0">Melhor condição</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              <span>Prazo: {p.max_days === 0 ? "à vista" : `${p.max_days} dias`}</span>
              {p.discount_percent > 0 && <span>Desconto: {formatarPercentual(p.discount_percent)}</span>}
              {p.monthly_interest_percent > 0 && (
                <span>Juros: {formatarPercentual(p.monthly_interest_percent)} a.m.</span>
              )}
              {p.installment_count > 1 && <span>{p.installment_count} parcelas</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {p.requires_financial_approval && (
                <Badge variant="secondary" className="text-[10px]">Exige aprovação financeira</Badge>
              )}
              {p.requires_guarantee && (
                <Badge variant="outline" className="text-[10px]">Exige garantia</Badge>
              )}
              {p.monthly_interest_percent > 0 && (
                <Badge variant="outline" className="text-[10px]">Custo financeiro incluso</Badge>
              )}
            </div>
            {selected && (
              <div className="text-xs pt-1 border-t text-muted-foreground">
                {loading
                  ? "Calculando condição…"
                  : finalAmount != null
                    ? p.installment_count > 1
                      ? `${p.installment_count}× de ${brl(finalAmount / p.installment_count)}`
                      : "Pagamento único"
                    : "Condição selecionada"}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
