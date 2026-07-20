import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useB2BExecutiveAlerts } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";
import { AlertTriangle, Ban, TrendingDown, ShieldAlert } from "lucide-react";

type Item = { partner_id: string; nome?: string; pct?: number; aberto?: number; limite?: number; numero?: string; vencidos?: number; dias?: number; score?: number };

function List({ items, render }: { items: Item[] | null | undefined; render: (i: Item) => React.ReactNode }) {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">Nenhum.</p>;
  return <ul className="space-y-1 text-sm">{items.map((i, idx) => <li key={idx} className="flex items-center justify-between gap-2">{render(i)}</li>)}</ul>;
}

export default function AlertasFinanceirosB2B() {
  const { data } = useB2BExecutiveAlerts();
  const d = data ?? {};
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Alertas Financeiros B2B</h1>
        <p className="text-sm text-muted-foreground">Sinalizadores executivos para ação imediata.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-amber-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Crédito ≥ 80%</CardTitle></CardHeader>
          <CardContent><List items={d.acima_80} render={(i) => <><span>{i.nome}</span><Badge variant="outline" className="bg-amber-50 text-amber-700">{i.pct}% · {brl(i.aberto ?? 0)}</Badge></>} /></CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Crédito ≥ 90%</CardTitle></CardHeader>
          <CardContent><List items={d.acima_90} render={(i) => <><span>{i.nome}</span><Badge variant="destructive">{i.pct}% · {brl(i.aberto ?? 0)}</Badge></>} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Ban className="h-4 w-4 text-destructive" /> Pedidos bloqueados</CardTitle></CardHeader>
          <CardContent><List items={d.bloqueados} render={(i) => <><span>Pedido {i.numero}</span><Badge variant="destructive">Bloqueado</Badge></>} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Parceiros com vencidos</CardTitle></CardHeader>
          <CardContent><List items={d.com_vencidos} render={(i) => <><span>Parceiro {i.partner_id?.slice(0,8)}</span><Badge variant="destructive">{i.vencidos} títulos · {Number(i.dias ?? 0).toFixed(0)}d</Badge></>} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-destructive" /> Score crítico</CardTitle></CardHeader>
          <CardContent><List items={d.score_critico} render={(i) => <><span>Parceiro {i.partner_id?.slice(0,8)}</span><Badge variant="destructive">Score {i.score}</Badge></>} /></CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Receita em risco</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold text-destructive">{brl(Number(d.receita_em_risco ?? 0))}</p></CardContent>
        </Card>
      </div>
    </div>
  );
}
