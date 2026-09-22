import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/financial/format";
import { PeriodoFilter, defaultPeriodo, validarPeriodo, type PeriodoState } from "@/components/financeiro/bi/PeriodoFilter";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { EstornosResumoCard } from "@/components/financeiro/EstornosResumoCard";
import { intervaloDetalhe, type Agrupamento } from "@/lib/financeiro/periodoBucket";

type Row = {
  period_label: string; period_start: string;
  expected_inflows: number; expected_outflows: number;
  realized_inflows: number; realized_outflows: number;
  projected_balance: number; realized_balance: number;
  accumulated_projected_balance: number; accumulated_realized_balance: number;
};

export const MSG_ERRO_FLUXO = "Não foi possível carregar o fluxo de caixa do período.";
export const MSG_ERRO_DETALHE = "Não foi possível carregar os títulos deste período.";
export const LIMITE_DETALHE = 100;
const SEM_DADO = "—";

function BlocoErro({ mensagem, onTentar, ocupado }: { mensagem: string; onTentar: () => void; ocupado?: boolean }) {
  return (
    <div className="space-y-2 py-4 text-center" role="alert">
      <p className="text-sm text-destructive">{mensagem}</p>
      <Button size="sm" variant="outline" onClick={onTentar} disabled={ocupado}>
        <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
      </Button>
    </div>
  );
}

export default function FluxoCaixa() {
  const [periodo, setPeriodo] = useState<PeriodoState>(defaultPeriodo());
  const [groupBy, setGroupBy] = useState<Agrupamento>("DAY");
  const [viewMode, setViewMode] = useState<"PROJECTED" | "REALIZED" | "COMPARATIVE">("PROJECTED");
  const [drillBucket, setDrillBucket] = useState<Row | null>(null);

  const periodoErro = validarPeriodo(periodo);
  const periodoValido = !periodoErro;

  // Mudou o recorte, o agrupamento ou o modo: o detalhe aberto não vale mais.
  useEffect(() => {
    setDrillBucket(null);
  }, [periodo.from, periodo.to, groupBy, viewMode]);

  const fluxo = useQuery({
    queryKey: ["fluxo-caixa", periodo.from, periodo.to, groupBy, viewMode],
    enabled: periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_cashflow" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to,
        p_view_mode: viewMode, p_group_by: groupBy,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const data = fluxo.isError ? undefined : fluxo.data;
  const linhas = data ?? [];
  const indisponivel = !periodoValido || fluxo.isError || fluxo.isLoading || !data;
  const atualizando = fluxo.isFetching && !fluxo.isLoading;

  const totais = useMemo(() => ({
    expIn: linhas.reduce((s, r) => s + Number(r.expected_inflows || 0), 0),
    expOut: linhas.reduce((s, r) => s + Number(r.expected_outflows || 0), 0),
    realIn: linhas.reduce((s, r) => s + Number(r.realized_inflows || 0), 0),
    realOut: linhas.reduce((s, r) => s + Number(r.realized_outflows || 0), 0),
  }), [linhas]);

  const valor = (n: number) => (indisponivel ? SEM_DADO : brl(n));

  const chartData = linhas.map((r) => ({
    ...r,
    Previsto: Number(r.projected_balance),
    Realizado: Number(r.realized_balance),
    AccProj: Number(r.accumulated_projected_balance),
    AccReal: Number(r.accumulated_realized_balance),
  }));

  const showProj = viewMode !== "REALIZED";
  const showReal = viewMode !== "PROJECTED";
  const colunas = 1 + (showProj ? 3 : 0) + (showReal ? 3 : 0) + (showProj ? 1 : 0) + (showReal ? 1 : 0);

  const conteudoSecao = (vazio: boolean, mensagemVazio: string, conteudo: React.ReactNode) => {
    if (!periodoValido) return <p className="text-sm text-muted-foreground py-6 text-center">Defina um período válido para ver esta seção.</p>;
    if (fluxo.isLoading) return <p className="text-sm text-muted-foreground py-6 text-center" role="status">Carregando…</p>;
    if (fluxo.isError) return <BlocoErro mensagem={MSG_ERRO_FLUXO} onTentar={() => void fluxo.refetch()} ocupado={fluxo.isFetching} />;
    if (vazio) return <p className="text-sm text-muted-foreground py-6 text-center">{mensagemVazio}</p>;
    return <div className={atualizando ? "opacity-60" : undefined}>{conteudo}</div>;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Fluxo de Caixa</h1>
      <PeriodoFilter value={periodo} onChange={setPeriodo} showRegime={false} />

      <p className="text-xs text-muted-foreground">
        Projetado soma o saldo restante de cada parcela (valor original menos o que já foi recebido/pago e os descontos),
        pela data de vencimento — por isso difere do previsto bruto do painel financeiro. Realizado soma os pagamentos
        pela data de pagamento, já incluindo estornos com valor negativo. O acumulado começa em zero no início do
        período selecionado: não é o saldo das contas bancárias.
      </p>

      {!periodoValido && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {periodoErro} O fluxo de caixa não foi consultado.
        </div>
      )}

      {viewMode !== "PROJECTED" && periodoValido && <EstornosResumoCard from={periodo.from} to={periodo.to} />}

      <div className="flex flex-wrap gap-2">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="PROJECTED">Projetado</TabsTrigger>
            <TabsTrigger value="REALIZED">Realizado</TabsTrigger>
            <TabsTrigger value="COMPARATIVE">Comparativo</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as Agrupamento)}>
          <TabsList>
            <TabsTrigger value="DAY">Diário</TabsTrigger>
            <TabsTrigger value="WEEK">Semanal</TabsTrigger>
            <TabsTrigger value="MONTH">Mensal</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {periodoValido && fluxo.isError && (
        <BlocoErro mensagem={MSG_ERRO_FLUXO} onTentar={() => void fluxo.refetch()} ocupado={fluxo.isFetching} />
      )}
      {atualizando && <p className="text-xs text-muted-foreground">Atualizando fluxo de caixa…</p>}

      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 ${atualizando ? "opacity-60" : ""}`}>
        {showProj && <>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas previstas (saldo restante)</p><p className="text-lg font-semibold text-emerald-600">{valor(totais.expIn)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saídas previstas (saldo restante)</p><p className="text-lg font-semibold text-destructive">{valor(totais.expOut)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saldo projetado</p><p className={`text-lg font-semibold ${indisponivel || (totais.expIn - totais.expOut) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{valor(totais.expIn - totais.expOut)}</p></CardContent></Card>
        </>}
        {showReal && <>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas realizadas</p><p className="text-lg font-semibold text-emerald-600">{valor(totais.realIn)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saídas realizadas</p><p className="text-lg font-semibold text-destructive">{valor(totais.realOut)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saldo realizado</p><p className={`text-lg font-semibold ${indisponivel || (totais.realIn - totais.realOut) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{valor(totais.realIn - totais.realOut)}</p></CardContent></Card>
        </>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Evolução do saldo acumulado no período</CardTitle></CardHeader>
        <CardContent>
          {conteudoSecao(
            chartData.length === 0,
            "Sem movimentação no período selecionado.",
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Legend />
                  {showProj && <Line type="monotone" dataKey="AccProj" stroke="hsl(var(--primary))" name="Acumulado projetado" strokeWidth={2} dot={false} />}
                  {showReal && <Line type="monotone" dataKey="AccReal" stroke="hsl(var(--secondary))" name="Acumulado realizado" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>,
          )}
        </CardContent>
      </Card>

      {viewMode === "COMPARATIVE" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Saldo por período — projetado vs realizado</CardTitle></CardHeader>
          <CardContent>
            {conteudoSecao(
              chartData.length === 0,
              "Sem movimentação no período selecionado.",
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period_label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => brl(v)} />
                    <Legend />
                    <Bar dataKey="Previsto" fill="hsl(var(--primary))" name="Saldo projetado" />
                    <Bar dataKey="Realizado" fill="hsl(var(--secondary))" name="Saldo realizado" />
                  </BarChart>
                </ResponsiveContainer>
              </div>,
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento por período</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {!periodoValido || fluxo.isError ? (
            conteudoSecao(false, "", null)
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Período</TableHead>
                {showProj && <TableHead className="text-right">Entr. prev.</TableHead>}
                {showProj && <TableHead className="text-right">Saíd. prev.</TableHead>}
                {showProj && <TableHead className="text-right">Saldo proj.</TableHead>}
                {showReal && <TableHead className="text-right">Entr. real.</TableHead>}
                {showReal && <TableHead className="text-right">Saíd. real.</TableHead>}
                {showReal && <TableHead className="text-right">Saldo real.</TableHead>}
                {showProj && <TableHead className="text-right">Acum. projetado</TableHead>}
                {showReal && <TableHead className="text-right">Acum. realizado</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {fluxo.isLoading && <TableRow><TableCell colSpan={colunas} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
                {!fluxo.isLoading && linhas.length === 0 && <TableRow><TableCell colSpan={colunas} className="text-center text-muted-foreground">Sem movimentação no período selecionado.</TableCell></TableRow>}
                {chartData.map((r) => (
                  <TableRow
                    key={r.period_start}
                    className="cursor-pointer hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver títulos de ${r.period_label}`}
                    onClick={() => setDrillBucket(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrillBucket(r); }
                    }}
                  >
                    <TableCell className="font-medium">{r.period_label}</TableCell>
                    {showProj && <TableCell className="text-right text-emerald-600">{brl(Number(r.expected_inflows))}</TableCell>}
                    {showProj && <TableCell className="text-right text-destructive">{brl(Number(r.expected_outflows))}</TableCell>}
                    {showProj && <TableCell className={`text-right font-medium ${r.Previsto >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(r.Previsto)}</TableCell>}
                    {showReal && <TableCell className="text-right text-emerald-600">{brl(Number(r.realized_inflows))}</TableCell>}
                    {showReal && <TableCell className="text-right text-destructive">{brl(Number(r.realized_outflows))}</TableCell>}
                    {showReal && <TableCell className={`text-right font-medium ${r.Realizado >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(r.Realizado)}</TableCell>}
                    {showProj && <TableCell className={`text-right ${r.AccProj >= 0 ? "" : "text-destructive"}`}>{brl(r.AccProj)}</TableCell>}
                    {showReal && <TableCell className={`text-right ${r.AccReal >= 0 ? "" : "text-destructive"}`}>{brl(r.AccReal)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DrillDownDialog
        row={drillBucket}
        groupBy={groupBy}
        viewMode={viewMode}
        periodo={{ from: periodo.from, to: periodo.to }}
        onClose={() => setDrillBucket(null)}
      />
    </div>
  );
}

/**
 * Saldo a realizar de um título, alinhado ao RPC get_financial_cashflow:
 * título quitado (PAID) ou cancelado (CANCELED) projeta zero.
 * Nos demais status: original + juros + multa - abatido - desconto, em centavos,
 * com clamp em zero.
 */
export function saldoRestante(
  original: unknown,
  abatido: unknown,
  desconto: unknown,
  status?: unknown,
  juros: unknown = 0,
  multa: unknown = 0,
) {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "PAID" || s === "CANCELED") return 0;
  const cent = (v: unknown) => Math.round(Number(v || 0) * 100);
  const total =
    cent(original) + cent(juros) + cent(multa) - cent(abatido) - cent(desconto);
  return Math.max(0, total) / 100;
}


function DrillDownDialog({
  row, groupBy, viewMode, periodo, onClose,
}: {
  row: Row | null;
  groupBy: Agrupamento;
  viewMode: string;
  periodo: { from: string; to: string };
  onClose: () => void;
}) {
  const open = !!row;
  // Intervalo do bucket LIMITADO ao recorte selecionado — o detalhe nunca extrapola o filtro.
  const dateRange = useMemo(
    () => (row ? intervaloDetalhe(row.period_start, groupBy, periodo) : null),
    [row, groupBy, periodo],
  );

  const mostrarProjetado = viewMode !== "REALIZED";
  const mostrarRealizado = viewMode !== "PROJECTED";
  const ativo = open && !!dateRange;

  const receber = useQuery({
    enabled: ativo && mostrarProjetado,
    queryKey: ["drill-receber", dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable_installments")
        .select("id, due_date, original_amount, received_amount, discount_amount, interest_amount, penalty_amount, status, accounts_receivable!inner(description, clientes(nome))")
        .gte("due_date", dateRange!.from).lte("due_date", dateRange!.to)
        .neq("status", "CANCELED").order("due_date").limit(LIMITE_DETALHE + 1);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const pagar = useQuery({
    enabled: ativo && mostrarProjetado,
    queryKey: ["drill-pagar", dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable_installments")
        .select("id, due_date, original_amount, paid_amount, discount_amount, interest_amount, penalty_amount, status, accounts_payable!inner(supplier_name, description)")
        .gte("due_date", dateRange!.from).lte("due_date", dateRange!.to)
        .neq("status", "CANCELED").order("due_date").limit(LIMITE_DETALHE + 1);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const recebimentos = useQuery({
    enabled: ativo && mostrarRealizado,
    queryKey: ["drill-recebimentos", dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("receivable_payments")
        .select("id, payment_date, amount_received, is_reversal, accounts_receivable_installments!inner(due_date, accounts_receivable!inner(description, clientes(nome)))")
        .gte("payment_date", dateRange!.from).lte("payment_date", dateRange!.to)
        .order("payment_date").limit(LIMITE_DETALHE + 1);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const pagamentos = useQuery({
    enabled: ativo && mostrarRealizado,
    queryKey: ["drill-pagamentos", dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payable_payments")
        .select("id, payment_date, amount_paid, is_reversal, accounts_payable_installments!inner(due_date, accounts_payable!inner(supplier_name, description))")
        .gte("payment_date", dateRange!.from).lte("payment_date", dateRange!.to)
        .order("payment_date").limit(LIMITE_DETALHE + 1);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const consultas = [
    ...(mostrarProjetado ? [receber, pagar] : []),
    ...(mostrarRealizado ? [recebimentos, pagamentos] : []),
  ];
  const carregando = consultas.some((q) => q.isLoading && q.fetchStatus !== "idle");
  const comErro = consultas.some((q) => q.isError);
  const tentarNovamente = () => consultas.forEach((q) => void q.refetch());

  const corta = <T,>(lista: T[] | undefined) => (lista ?? []).slice(0, LIMITE_DETALHE);
  const parcial = (lista: unknown[] | undefined) => (lista?.length ?? 0) > LIMITE_DETALHE;

  const listaReceber = corta(receber.isError ? [] : receber.data);
  const listaPagar = corta(pagar.isError ? [] : pagar.data);
  const listaRecebimentos = corta(recebimentos.isError ? [] : recebimentos.data);
  const listaPagamentos = corta(pagamentos.isError ? [] : pagamentos.data);

  const algumParcial =
    parcial(receber.data) || parcial(pagar.data) || parcial(recebimentos.data) || parcial(pagamentos.data);

  const vazio =
    !carregando && !comErro &&
    listaReceber.length === 0 && listaPagar.length === 0 &&
    listaRecebimentos.length === 0 && listaPagamentos.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Títulos de {row?.period_label}</DialogTitle>
          <DialogDescription>
            {dateRange
              ? `Período detalhado: ${dateRange.from} a ${dateRange.to} (limitado ao filtro selecionado).`
              : "Este período não faz parte do recorte selecionado."}
          </DialogDescription>
        </DialogHeader>

        {carregando && <p className="text-sm text-muted-foreground" role="status">Carregando títulos…</p>}

        {comErro && (
          <BlocoErro mensagem={MSG_ERRO_DETALHE} onTentar={tentarNovamente} />
        )}

        {algumParcial && !comErro && (
          <p className="text-xs text-amber-700 dark:text-amber-500" role="status">
            Lista parcial: mostrando os primeiros {LIMITE_DETALHE} lançamentos. Os totais do período acima continuam completos.
          </p>
        )}

        {mostrarProjetado && listaReceber.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-2 text-emerald-700">A receber ({listaReceber.length})</h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor original</TableHead>
                <TableHead className="text-right">Saldo restante</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {listaReceber.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.accounts_receivable?.clientes?.nome ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.accounts_receivable?.description}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.original_amount))}</TableCell>
                    <TableCell className="text-right font-medium">
                      {brl(saldoRestante(r.original_amount, r.received_amount, r.discount_amount, r.status, r.interest_amount, r.penalty_amount))}
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {mostrarProjetado && listaPagar.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-2 text-destructive">A pagar ({listaPagar.length})</h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fornecedor</TableHead><TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor original</TableHead>
                <TableHead className="text-right">Saldo restante</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {listaPagar.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.accounts_payable?.supplier_name}</TableCell>
                    <TableCell className="text-sm">{r.accounts_payable?.description}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.original_amount))}</TableCell>
                    <TableCell className="text-right font-medium">
                      {brl(saldoRestante(r.original_amount, r.paid_amount, r.discount_amount, r.status, r.interest_amount, r.penalty_amount))}
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {mostrarRealizado && listaRecebimentos.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-2 text-emerald-700">Recebimentos ({listaRecebimentos.length})</h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead>Descrição</TableHead>
                <TableHead>Data do pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Tipo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {listaRecebimentos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {p.accounts_receivable_installments?.accounts_receivable?.clientes?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.accounts_receivable_installments?.accounts_receivable?.description}
                    </TableCell>
                    <TableCell className="text-sm">{p.payment_date}</TableCell>
                    <TableCell className="text-right">{brl(Number(p.amount_received))}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_reversal ? "destructive" : "outline"}>
                        {p.is_reversal ? "Estorno" : "Recebimento"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {mostrarRealizado && listaPagamentos.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-2 text-destructive">Pagamentos ({listaPagamentos.length})</h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fornecedor</TableHead><TableHead>Descrição</TableHead>
                <TableHead>Data do pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Tipo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {listaPagamentos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {p.accounts_payable_installments?.accounts_payable?.supplier_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.accounts_payable_installments?.accounts_payable?.description}
                    </TableCell>
                    <TableCell className="text-sm">{p.payment_date}</TableCell>
                    <TableCell className="text-right">{brl(Number(p.amount_paid))}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_reversal ? "destructive" : "outline"}>
                        {p.is_reversal ? "Estorno" : "Pagamento"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {vazio && (
          <p className="text-sm text-muted-foreground">Nenhum lançamento neste período.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
