import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { brl } from "@/lib/financial/format";
import type { FinanceiroResumo } from "@/hooks/useExecutivoFinanceiroResumo";
import { Receipt, TrendingDown, TrendingUp, FileWarning, Truck, FileText, AlertCircle } from "lucide-react";

interface Props {
  data?: FinanceiroResumo;
  isLoading?: boolean;
}

function Cell({
  label,
  value,
  qty,
  hint,
  unavailable,
  tone,
  onClick,
  icon: Icon,
}: {
  label: string;
  value?: string;
  qty?: number;
  hint?: string;
  unavailable?: boolean;
  tone?: "default" | "warn" | "danger" | "ok";
  onClick?: () => void;
  icon: any;
}) {
  const toneCls =
    tone === "danger" ? "text-destructive" :
    tone === "warn" ? "text-amber-600" :
    tone === "ok" ? "text-emerald-600" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-3 rounded-md border bg-card hover:bg-accent transition-colors w-full"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {unavailable ? (
        <div className="text-sm text-muted-foreground italic">Sem dados suficientes.</div>
      ) : (
        <>
          <div className={`text-lg font-semibold ${toneCls}`}>{value ?? "—"}</div>
          {qty !== undefined && (
            <div className="text-xs text-muted-foreground">{qty} {hint ?? ""}</div>
          )}
        </>
      )}
    </button>
  );
}

export function ExecutivoFinanceiroCards({ data, isLoading }: Props) {
  const navigate = useNavigate();
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i} className="p-3 h-20 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }
  const ind = data.dados_indisponiveis ?? [];
  const u = (k: string) => ind.includes(k);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <Cell icon={TrendingUp} label="Total a receber" value={brl(data.receitas.total_a_receber)} qty={data.receitas.quantidade_titulos_abertos} hint="títulos abertos" unavailable={u("receitas_abertas")} onClick={() => navigate("/financeiro/receber")} />
      <Cell icon={AlertCircle} label="Vencido a receber" value={brl(data.receitas.total_vencido)} qty={data.receitas.quantidade_parcelas_vencidas} hint="parcelas" tone={data.receitas.total_vencido > 0 ? "danger" : "ok"} unavailable={u("receitas_abertas")} onClick={() => navigate("/financeiro/receber?vencidos=1")} />
      <Cell icon={Receipt} label="Recebido no período" value={brl(data.receitas.total_recebido)} unavailable={u("receitas_recebidas")} onClick={() => navigate("/financeiro/receber?status=paid")} />
      <Cell icon={TrendingDown} label="Total a pagar" value={brl(data.despesas.total_a_pagar)} qty={data.despesas.quantidade_titulos_abertos} hint="títulos abertos" unavailable={u("despesas_abertas")} onClick={() => navigate("/financeiro/pagar")} />
      <Cell icon={AlertCircle} label="Vencido a pagar" value={brl(data.despesas.total_vencido)} qty={data.despesas.quantidade_parcelas_vencidas} hint="parcelas" tone={data.despesas.total_vencido > 0 ? "danger" : "ok"} unavailable={u("despesas_abertas")} onClick={() => navigate("/financeiro/pagar?vencidos=1")} />
      <Cell icon={Receipt} label="Pago no período" value={brl(data.despesas.total_pago)} unavailable={u("despesas_pagas")} onClick={() => navigate("/financeiro/pagar?status=paid")} />
      <Cell icon={Truck} label="Entregas não faturadas" value={String(data.faturamento.entregas_nao_faturadas)} tone={data.faturamento.entregas_nao_faturadas > 0 ? "warn" : "ok"} unavailable={u("entregas_nao_faturadas")} onClick={() => navigate("/financeiro/entregas-nao-faturadas")} />
      <Cell icon={FileText} label="Valor estimado não faturado" unavailable={u("valor_estimado_nao_faturado")} value={brl(data.faturamento.valor_estimado_nao_faturado)} onClick={() => navigate("/financeiro/entregas-nao-faturadas")} />
      <Cell icon={FileWarning} label="Fiscal pendente" value={String(data.faturamento.fiscal_pendente)} tone={data.faturamento.fiscal_pendente > 0 ? "warn" : "ok"} unavailable={u("fiscal_pendente")} onClick={() => navigate("/financeiro/notas-fiscais")} />
      <Cell icon={Receipt} label="Recibos pendentes" value={String(data.faturamento.recibos_pendentes)} tone={data.faturamento.recibos_pendentes > 0 ? "warn" : "ok"} unavailable={u("recibos_pendentes")} onClick={() => navigate("/financeiro/recibos")} />
      <Cell icon={Receipt} label="Entregas faturadas (período)" value={String(data.faturamento.entregas_faturadas)} qty={undefined} unavailable={u("entregas_faturadas")} onClick={() => navigate("/entregas")} />
      <Cell icon={TrendingUp} label="Valor faturado entregas" value={brl(data.faturamento.valor_faturado_entregas)} unavailable={u("entregas_faturadas")} onClick={() => navigate("/entregas")} />
    </div>
  );
}
