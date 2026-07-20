import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { brl } from "@/lib/financial/format";
import { Undo2 } from "lucide-react";

interface Props {
  from: string;
  to: string;
}

/**
 * Mostra os estornos do período para transparência no DRE e no Fluxo de Caixa.
 * Regra oficial: estornos têm valor negativo e já cancelam o pagamento original
 * na soma realizada — este card apenas explicita o impacto.
 */
export function EstornosResumoCard({ from, to }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["fin-estornos-resumo", from, to],
    queryFn: async () => {
      const [rec, pay] = await Promise.all([
        supabase
          .from("receivable_payments")
          .select("amount_received")
          .eq("is_reversal", true)
          .gte("payment_date", from)
          .lte("payment_date", to),
        supabase
          .from("payable_payments")
          .select("amount_paid")
          .eq("is_reversal", true)
          .gte("payment_date", from)
          .lte("payment_date", to),
      ]);
      if (rec.error) throw rec.error;
      if (pay.error) throw pay.error;
      const recSum = (rec.data || []).reduce((s: number, r: any) => s + Number(r.amount_received || 0), 0);
      const paySum = (pay.data || []).reduce((s: number, r: any) => s + Number(r.amount_paid || 0), 0);
      return {
        recCount: rec.data?.length || 0,
        paySum,
        recSum,
        payCount: pay.data?.length || 0,
      };
    },
  });

  if (isLoading || !data) return null;
  if (data.recCount === 0 && data.payCount === 0) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10">
      <CardContent className="p-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Undo2 className="h-4 w-4 text-amber-600" />
          Estornos no período
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Receber: </span>
          <strong>{data.recCount}</strong> lançamento(s) · <strong>{brl(data.recSum)}</strong>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Pagar: </span>
          <strong>{data.payCount}</strong> lançamento(s) · <strong>{brl(data.paySum)}</strong>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          Já abatidos do realizado (valores negativos).
        </span>
      </CardContent>
    </Card>
  );
}
