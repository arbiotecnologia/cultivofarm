import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import { cn } from "@/lib/utils";
import type { CommercialPaymentPlan } from "@/hooks/useCommercialPaymentPlans";

interface Props {
  plans: CommercialPaymentPlan[];
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  finalAmountByPlan?: Record<string, number>;
  loading?: boolean;
}

export function PaymentPlanSelector({ plans, selectedPlanId, onSelect, finalAmountByPlan, loading }: Props) {
  if (!plans.length) {
    return <p className="text-sm text-muted-foreground">Nenhuma condição de pagamento disponível.</p>;
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
              <span>Prazo: {p.max_days}d</span>
              <span>Desc.: {Number(p.discount_percent).toFixed(1)}%</span>
              <span>Juros: {Number(p.monthly_interest_percent).toFixed(2)}% a.m.</span>
              {p.installment_count > 1 && <span>{p.installment_count}x</span>}
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
            {selected && finalAmount != null && (
              <div className="text-xs pt-1 border-t">
                Total final: <span className="font-semibold">{brl(finalAmount)}</span>
                {loading && <span className="ml-1 text-muted-foreground">(calculando…)</span>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
