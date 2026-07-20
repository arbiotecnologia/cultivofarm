import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Wallet, AlertTriangle, ShieldCheck } from "lucide-react";
import { usePortalPartnerCredit } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";

export function MinhaSituacaoFinanceira() {
  const { data, isLoading } = usePortalPartnerCredit();

  if (isLoading) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">Carregando situação financeira…</CardContent></Card>;
  }
  if (!data) return null;

  const pct = Number(data.percentual_utilizado || 0);
  const tone = pct >= 90 ? "destructive" : pct >= 80 ? "secondary" : "default";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Minha Situação Financeira
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Limite de crédito</p>
            <p className="font-semibold">{brl(Number(data.credit_limit || 0))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Crédito utilizado</p>
            <p className="font-semibold">{brl(Number(data.saldo_em_aberto || 0))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Crédito disponível</p>
            <p className="font-semibold text-emerald-600">{brl(Number(data.credito_disponivel || 0))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Títulos vencidos</p>
            <p className="font-semibold text-destructive">{brl(Number(data.saldo_vencido || 0))}</p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" /> Utilização do limite
            </span>
            <Badge variant={tone as any}>{pct}%</Badge>
          </div>
          <Progress value={Math.min(pct, 100)} />
        </div>

        {data.tem_vencidos && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <span>Você possui títulos vencidos. Regularize para liberar novos pedidos.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
