import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/financial/format";
import { PeriodoFilter, defaultPeriodo, type PeriodoState } from "@/components/financeiro/bi/PeriodoFilter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { EstornosResumoCard } from "@/components/financeiro/EstornosResumoCard";

type DreData = Record<string, { total: number; qtd: number }> & {
  resultado_operacional: number;
  margem_operacional_percentual: number;
  unclassified_categories: { id: string; name: string }[];
};

type Regime = "CASH" | "ACCRUAL";

const STRUCTURE: { key: string; label: string; sign: "+" | "-"; tone?: "success" | "muted" }[] = [
  { key: "receita_bruta", label: "Receita Bruta", sign: "+", tone: "success" },
  { key: "deducoes", label: "(−) Deduções", sign: "-" },
  { key: "custo_producao", label: "(−) Custos de Produção", sign: "-" },
  { key: "despesa_variavel", label: "(−) Despesas Variáveis", sign: "-" },
  { key: "despesa_fixa", label: "(−) Despesas Fixas", sign: "-" },
  { key: "despesa_administrativa", label: "(−) Despesas Administrativas", sign: "-" },
  { key: "despesa_comercial", label: "(−) Despesas Comerciais", sign: "-" },
  { key: "despesa_financeira", label: "(−) Despesas Financeiras", sign: "-" },
  { key: "impostos", label: "(−) Impostos", sign: "-" },
  { key: "outras_receitas", label: "(+) Outras Receitas", sign: "+", tone: "success" },
  { key: "outras_despesas", label: "(−) Outras Despesas", sign: "-" },
];

export default function DRE() {
  const [periodo, setPeriodo] = useState<PeriodoState>(defaultPeriodo());
  const [regime, setRegime] = useState<Regime>("CASH");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["dre", periodo.from, periodo.to, regime],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_dre_summary" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to, p_regime: regime,
      });
      if (error) throw error;
      return data as DreData;
    },
  });

  const unclassified = data?.unclassified_categories || [];
  const get = (k: string) => Number(data?.[k]?.total || 0);
  const qty = (k: string) => Number(data?.[k]?.qtd || 0);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">DRE Gerencial</h1>
          <p className="text-sm text-muted-foreground">Demonstração de Resultados</p>
        </div>
        <Tabs value={regime} onValueChange={(v) => setRegime(v as Regime)}>
          <TabsList>
            <TabsTrigger value="CASH">Caixa</TabsTrigger>
            <TabsTrigger value="ACCRUAL">Competência</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <PeriodoFilter value={periodo} onChange={setPeriodo} showRegime={false} />

      {regime === "CASH" && <EstornosResumoCard from={periodo.from} to={periodo.to} />}

      {unclassified.length > 0 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <span>
                Existem <strong>{unclassified.length}</strong> categoria(s) financeira(s) sem classificação DRE.
                Os valores aparecem em <em>"Não classificado"</em>.
              </span>
            </div>
            <Link to="/financeiro/categorias">
              <Button size="sm" variant="outline">Classificar agora</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Resultado — {regime === "CASH" ? "Regime de Caixa" : "Regime de Competência"}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[55%]">Linha</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {STRUCTURE.map((s) => (
                <DreGroupRow
                  key={s.key}
                  groupKey={s.key}
                  label={s.label}
                  sign={s.sign}
                  tone={s.tone}
                  total={get(s.key)}
                  qtd={qty(s.key)}
                  periodo={periodo}
                  regime={regime}
                  expanded={!!expanded[s.key]}
                  onToggle={() => setExpanded((p) => ({ ...p, [s.key]: !p[s.key] }))}
                />
              ))}
              {get("sem_classificacao") > 0 && (
                <TableRow className="bg-amber-50 dark:bg-amber-950/20">
                  <TableCell className="text-sm">⚠ Não classificado</TableCell>
                  <TableCell className="text-right text-sm">{qty("sem_classificacao")}</TableCell>
                  <TableCell className="text-right text-sm">{brl(get("sem_classificacao"))}</TableCell>
                </TableRow>
              )}
              <TableRow className="bg-muted/40 border-t-2">
                <TableCell className="font-bold text-base">= Resultado Operacional</TableCell>
                <TableCell></TableCell>
                <TableCell className={`text-right font-bold text-base ${Number(data?.resultado_operacional || 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {brl(Number(data?.resultado_operacional || 0))}
                  <Badge variant="outline" className="ml-2">{Number(data?.margem_operacional_percentual || 0).toFixed(2)}%</Badge>
                </TableCell>
              </TableRow>
              {isLoading && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function DreGroupRow({
  groupKey, label, sign, tone, total, qtd, periodo, regime, expanded, onToggle,
}: {
  groupKey: string; label: string; sign: "+" | "-"; tone?: "success" | "muted";
  total: number; qtd: number; periodo: PeriodoState; regime: Regime;
  expanded: boolean; onToggle: () => void;
}) {
  const dreGroupCode = groupKey.toUpperCase();
  const isReceita = ["receita_bruta", "outras_receitas"].includes(groupKey);

  const { data: detail = [] } = useQuery({
    enabled: expanded && qtd > 0,
    queryKey: ["dre-detail", groupKey, periodo.from, periodo.to, regime],
    queryFn: async () => {
      if (isReceita) {
        if (regime === "CASH") {
          const { data, error } = await supabase
            .from("receivable_payments")
            .select("amount_received, payment_date, is_reversal, accounts_receivable_installments!inner(accounts_receivable!inner(description, category_id, financial_categories!inner(name, dre_group), clientes!inner(nome)))")
            .gte("payment_date", periodo.from).lte("payment_date", periodo.to);
          if (error) throw error;
          return (data || []).filter((d: any) => d.accounts_receivable_installments?.accounts_receivable?.financial_categories?.dre_group === dreGroupCode);
        } else {
          const { data, error } = await supabase
            .from("accounts_receivable_installments")
            .select("original_amount, due_date, accounts_receivable!inner(description, category_id, financial_categories!inner(name, dre_group), clientes!inner(nome))")
            .gte("due_date", periodo.from).lte("due_date", periodo.to).neq("status", "CANCELED");
          if (error) throw error;
          return (data || []).filter((d: any) => d.accounts_receivable?.financial_categories?.dre_group === dreGroupCode);
        }
      } else {
        if (regime === "CASH") {
          const { data, error } = await supabase
            .from("payable_payments")
            .select("amount_paid, payment_date, is_reversal, accounts_payable_installments!inner(accounts_payable!inner(description, supplier_name, financial_categories!inner(name, dre_group)))")
            .gte("payment_date", periodo.from).lte("payment_date", periodo.to);
          if (error) throw error;
          return (data || []).filter((d: any) => d.accounts_payable_installments?.accounts_payable?.financial_categories?.dre_group === dreGroupCode);
        } else {
          const { data, error } = await supabase
            .from("accounts_payable_installments")
            .select("original_amount, due_date, accounts_payable!inner(description, supplier_name, financial_categories!inner(name, dre_group))")
            .gte("due_date", periodo.from).lte("due_date", periodo.to).neq("status", "CANCELED");
          if (error) throw error;
          return (data || []).filter((d: any) => d.accounts_payable?.financial_categories?.dre_group === dreGroupCode);
        }
      }
    },
  });

  const cls = tone === "success" ? "text-emerald-600" : tone === "muted" ? "text-muted-foreground" : "";

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <TableCell className="flex items-center gap-1">
          {qtd > 0 ? (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
          {label}
        </TableCell>
        <TableCell className="text-right text-sm text-muted-foreground">{qtd || "—"}</TableCell>
        <TableCell className={`text-right ${cls}`}>{brl(sign === "-" ? -total : total)}</TableCell>
      </TableRow>
      {expanded && detail.length > 0 && (
        <TableRow>
          <TableCell colSpan={3} className="bg-muted/20 p-0">
            <Table>
              <TableBody>
                {detail.slice(0, 50).map((d: any, i: number) => {
                  const desc = isReceita
                    ? (d.accounts_receivable_installments?.accounts_receivable || d.accounts_receivable)
                    : (d.accounts_payable_installments?.accounts_payable || d.accounts_payable);
                  const name = isReceita ? desc?.clientes?.nome : desc?.supplier_name;
                  const amount = Number(d.amount_received || d.amount_paid || d.original_amount || 0);
                  const isReversal = d.is_reversal === true;
                  return (
                    <TableRow key={i} className={isReversal ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
                      <TableCell className="text-xs pl-12">
                        {isReversal && <Badge variant="outline" className="mr-2 border-amber-500 text-amber-700">Estorno</Badge>}
                        {desc?.financial_categories?.name} • {name} — {desc?.description}
                      </TableCell>
                      <TableCell className={`text-right text-xs w-32 ${isReversal ? "text-amber-700" : ""}`}>{brl(amount)}</TableCell>
                    </TableRow>
                  );
                })}
                {detail.length > 50 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-xs text-muted-foreground">+ {detail.length - 50} registros…</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
