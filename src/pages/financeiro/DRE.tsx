import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/financial/format";
import { PeriodoFilter, defaultPeriodo, validarPeriodo, type PeriodoState } from "@/components/financeiro/bi/PeriodoFilter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { EstornosResumoCard } from "@/components/financeiro/EstornosResumoCard";

type Grupo = { total?: number; qtd?: number } | null | undefined;
type DreData = Record<string, any> & {
  resultado_operacional?: number;
  margem_operacional_percentual?: number;
  unclassified_categories?: { id: string; name: string }[];
};

type Regime = "CASH" | "ACCRUAL";

export const MSG_ERRO_DRE = "Não foi possível carregar o DRE do período.";
export const MSG_ERRO_DETALHE_DRE = "Não foi possível carregar os lançamentos deste grupo.";
export const LIMITE_DETALHE_DRE = 50;
const SEM_DADO = "—";

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

/** O grupo tem atividade quando veio do servidor com quantidade ou valor diferente de zero. */
export function grupoTemAtividade(grupo: Grupo) {
  if (grupo === null || grupo === undefined) return false;
  const total = Number((grupo as any).total || 0);
  const qtd = Number((grupo as any).qtd || 0);
  return Number.isFinite(total) && Number.isFinite(qtd) ? qtd !== 0 || total !== 0 : false;
}

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

export default function DRE() {
  const [periodo, setPeriodo] = useState<PeriodoState>(defaultPeriodo());
  const [regime, setRegime] = useState<Regime>("CASH");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const periodoErro = validarPeriodo(periodo);
  const periodoValido = !periodoErro;

  // Trocou o recorte ou o regime: os detalhes abertos não valem mais.
  useEffect(() => {
    setExpanded({});
  }, [periodo.from, periodo.to, regime]);

  const dre = useQuery({
    queryKey: ["dre", periodo.from, periodo.to, regime],
    enabled: periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_dre_summary" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to, p_regime: regime,
      });
      if (error) throw error;
      return (data || null) as DreData | null;
    },
  });

  const data = dre.isError ? undefined : dre.data ?? undefined;
  const indisponivel = !periodoValido || dre.isError || dre.isLoading || !data;
  const atualizando = dre.isFetching && !dre.isLoading;

  const unclassified = data?.unclassified_categories || [];
  const grupo = (k: string): Grupo => (data ? (data as any)[k] : undefined);
  const get = (k: string) => Number((grupo(k) as any)?.total || 0);
  const qty = (k: string) => Number((grupo(k) as any)?.qtd || 0);
  const valor = (n: number) => (indisponivel ? SEM_DADO : brl(n));

  const semClassificacaoPresente = grupoTemAtividade(grupo("sem_classificacao")) ||
    (!!data && Object.prototype.hasOwnProperty.call(data, "sem_classificacao"));

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

      <p className="text-xs text-muted-foreground">
        No regime de competência cada título entra pelo valor original na data de vencimento. No regime de caixa entram
        os pagamentos pela data em que foram feitos, incluindo estornos com valor negativo. A coluna de quantidade conta
        apenas os lançamentos efetivos: estornos não são contados, por isso um período pode ter valor negativo com
        quantidade zero.
      </p>

      {!periodoValido && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {periodoErro} O DRE não foi consultado.
        </div>
      )}

      {regime === "CASH" && periodoValido && <EstornosResumoCard from={periodo.from} to={periodo.to} />}

      {unclassified.length > 0 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <span>
                Existem <strong>{unclassified.length}</strong> categoria(s) financeira(s) sem classificação DRE.
                Este inventário é global (não depende do período filtrado). Os valores dessas categorias aparecem em{" "}
                <em>"Não classificado"</em> e <strong>não compõem o resultado operacional</strong>.
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
          {!periodoValido ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Defina um período válido para ver o DRE.</p>
          ) : dre.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center" role="status">Carregando…</p>
          ) : dre.isError ? (
            <BlocoErro mensagem={MSG_ERRO_DRE} onTentar={() => void dre.refetch()} ocupado={dre.isFetching} />
          ) : (
            <div className={atualizando ? "opacity-60" : undefined}>
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
                      ativo={grupoTemAtividade(grupo(s.key))}
                      periodo={periodo}
                      regime={regime}
                      expanded={!!expanded[s.key]}
                      onToggle={() => setExpanded((p) => ({ ...p, [s.key]: !p[s.key] }))}
                    />
                  ))}
                  {semClassificacaoPresente && (
                    <>
                      <TableRow className="bg-amber-50 dark:bg-amber-950/20">
                        <TableCell className="text-sm">⚠ Não classificado</TableCell>
                        <TableCell className="text-right text-sm">{qty("sem_classificacao")}</TableCell>
                        <TableCell className="text-right text-sm">{brl(get("sem_classificacao"))}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={3} className="text-xs text-muted-foreground">
                          Os valores sem classificação não compõem o resultado operacional abaixo.
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                  <TableRow className="bg-muted/40 border-t-2">
                    <TableCell className="font-bold text-base">= Resultado Operacional</TableCell>
                    <TableCell></TableCell>
                    <TableCell className={`text-right font-bold text-base ${Number(data?.resultado_operacional || 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {valor(Number(data?.resultado_operacional || 0))}
                      <Badge variant="outline" className="ml-2">
                        {indisponivel ? SEM_DADO : `${Number(data?.margem_operacional_percentual || 0).toFixed(2)}%`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type LinhaDetalhe = {
  id: string;
  origem: "Recebimento" | "Pagamento" | "A receber" | "A pagar";
  data: string;
  categoria: string;
  parceiro: string;
  descricao: string;
  valor: number;
  estorno: boolean;
};

function texto(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || SEM_DADO;
}

function DreGroupRow({
  groupKey, label, sign, tone, total, qtd, ativo, periodo, regime, expanded, onToggle,
}: {
  groupKey: string; label: string; sign: "+" | "-"; tone?: "success" | "muted";
  total: number; qtd: number; ativo: boolean; periodo: PeriodoState; regime: Regime;
  expanded: boolean; onToggle: () => void;
}) {
  const dreGroupCode = groupKey.toUpperCase();
  const podeExpandir = ativo;

  // O filtro por grupo é aplicado no SERVIDOR, antes do limite — o detalhe nunca fica
  // incompleto por truncamento de uma leitura ampla. Ambas as origens são lidas porque
  // uma mesma categoria pode valer para receitas e despesas.
  const detalhe = useQuery({
    enabled: expanded && podeExpandir,
    queryKey: ["dre-detail", groupKey, periodo.from, periodo.to, regime],
    queryFn: async (): Promise<{ linhas: LinhaDetalhe[]; parcial: boolean; contagem: number | null }> => {
      const limite = LIMITE_DETALHE_DRE + 1;
      const linhas: LinhaDetalhe[] = [];
      let parcial = false;
      let contagem: number | null = null;
      const somaContagem = (c: unknown) => {
        if (typeof c === "number" && Number.isInteger(c) && c >= 0) contagem = (contagem ?? 0) + c;
        else contagem = null;
      };

      if (regime === "CASH") {
        const receb = await (supabase as any)
          .from("receivable_payments")
          .select(
            "id, amount_received, payment_date, is_reversal, accounts_receivable_installments!inner(accounts_receivable!inner(description, financial_categories!inner(name, dre_group), clientes(nome)))",
            { count: "exact" },
          )
          .eq("accounts_receivable_installments.accounts_receivable.financial_categories.dre_group", dreGroupCode)
          .gte("payment_date", periodo.from).lte("payment_date", periodo.to)
          .order("payment_date").limit(limite);
        if (receb.error) throw receb.error;

        const pag = await (supabase as any)
          .from("payable_payments")
          .select(
            "id, amount_paid, payment_date, is_reversal, accounts_payable_installments!inner(accounts_payable!inner(description, supplier_name, financial_categories!inner(name, dre_group)))",
            { count: "exact" },
          )
          .eq("accounts_payable_installments.accounts_payable.financial_categories.dre_group", dreGroupCode)
          .gte("payment_date", periodo.from).lte("payment_date", periodo.to)
          .order("payment_date").limit(limite);
        if (pag.error) throw pag.error;

        const lr = (receb.data || []) as any[];
        const lp = (pag.data || []) as any[];
        parcial = lr.length > LIMITE_DETALHE_DRE || lp.length > LIMITE_DETALHE_DRE;
        somaContagem(receb.count);
        somaContagem(pag.count);

        lr.slice(0, LIMITE_DETALHE_DRE).forEach((d, i) => {
          const conta = d.accounts_receivable_installments?.accounts_receivable;
          linhas.push({
            id: String(d.id ?? `r${i}`), origem: "Recebimento", data: texto(d.payment_date),
            categoria: texto(conta?.financial_categories?.name), parceiro: texto(conta?.clientes?.nome),
            descricao: texto(conta?.description), valor: Number(d.amount_received || 0), estorno: d.is_reversal === true,
          });
        });
        lp.slice(0, LIMITE_DETALHE_DRE).forEach((d, i) => {
          const conta = d.accounts_payable_installments?.accounts_payable;
          linhas.push({
            id: String(d.id ?? `p${i}`), origem: "Pagamento", data: texto(d.payment_date),
            categoria: texto(conta?.financial_categories?.name), parceiro: texto(conta?.supplier_name),
            descricao: texto(conta?.description), valor: Number(d.amount_paid || 0), estorno: d.is_reversal === true,
          });
        });
      } else {
        const rec = await (supabase as any)
          .from("accounts_receivable_installments")
          .select(
            "id, original_amount, due_date, status, accounts_receivable!inner(description, financial_categories!inner(name, dre_group), clientes(nome))",
            { count: "exact" },
          )
          .eq("accounts_receivable.financial_categories.dre_group", dreGroupCode)
          .gte("due_date", periodo.from).lte("due_date", periodo.to).neq("status", "CANCELED")
          .order("due_date").limit(limite);
        if (rec.error) throw rec.error;

        const pay = await (supabase as any)
          .from("accounts_payable_installments")
          .select(
            "id, original_amount, due_date, status, accounts_payable!inner(description, supplier_name, financial_categories!inner(name, dre_group))",
            { count: "exact" },
          )
          .eq("accounts_payable.financial_categories.dre_group", dreGroupCode)
          .gte("due_date", periodo.from).lte("due_date", periodo.to).neq("status", "CANCELED")
          .order("due_date").limit(limite);
        if (pay.error) throw pay.error;

        const lr = (rec.data || []) as any[];
        const lp = (pay.data || []) as any[];
        parcial = lr.length > LIMITE_DETALHE_DRE || lp.length > LIMITE_DETALHE_DRE;
        somaContagem(rec.count);
        somaContagem(pay.count);

        lr.slice(0, LIMITE_DETALHE_DRE).forEach((d, i) => {
          linhas.push({
            id: String(d.id ?? `ar${i}`), origem: "A receber", data: texto(d.due_date),
            categoria: texto(d.accounts_receivable?.financial_categories?.name),
            parceiro: texto(d.accounts_receivable?.clientes?.nome),
            descricao: texto(d.accounts_receivable?.description),
            valor: Number(d.original_amount || 0), estorno: false,
          });
        });
        lp.slice(0, LIMITE_DETALHE_DRE).forEach((d, i) => {
          linhas.push({
            id: String(d.id ?? `ap${i}`), origem: "A pagar", data: texto(d.due_date),
            categoria: texto(d.accounts_payable?.financial_categories?.name),
            parceiro: texto(d.accounts_payable?.supplier_name),
            descricao: texto(d.accounts_payable?.description),
            valor: Number(d.original_amount || 0), estorno: false,
          });
        });
      }

      return { linhas, parcial, contagem };
    },
  });

  const cls = tone === "success" ? "text-emerald-600" : tone === "muted" ? "text-muted-foreground" : "";
  const linhas = detalhe.data?.linhas ?? [];

  return (
    <>
      <TableRow className={podeExpandir ? "hover:bg-muted/40" : undefined}>
        <TableCell>
          {podeExpandir ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="flex items-center gap-1 text-left w-full"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {label}
            </button>
          ) : (
            <span className="flex items-center gap-1"><span className="w-4" />{label}</span>
          )}
        </TableCell>
        <TableCell className="text-right text-sm text-muted-foreground">{qtd || SEM_DADO}</TableCell>
        <TableCell className={`text-right ${cls}`}>{brl(sign === "-" ? -total : total)}</TableCell>
      </TableRow>
      {expanded && podeExpandir && (
        <TableRow>
          <TableCell colSpan={3} className="bg-muted/20">
            {detalhe.isLoading ? (
              <p className="text-xs text-muted-foreground py-2" role="status">Carregando lançamentos…</p>
            ) : detalhe.isError ? (
              <BlocoErro mensagem={MSG_ERRO_DETALHE_DRE} onTentar={() => void detalhe.refetch()} ocupado={detalhe.isFetching} />
            ) : linhas.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhum lançamento encontrado para este grupo no período.</p>
            ) : (
              <div className={detalhe.isFetching ? "opacity-60" : undefined}>
                {detalhe.data?.parcial && (
                  <p className="text-xs text-amber-700 dark:text-amber-500 py-1" role="status">
                    Lista parcial: mostrando até {LIMITE_DETALHE_DRE} lançamentos por origem
                    {typeof detalhe.data?.contagem === "number" ? ` de ${detalhe.data.contagem} no período` : ""}.
                    A soma desta lista não é o total do grupo.
                  </p>
                )}
                <p className="text-xs text-muted-foreground py-1">
                  Os valores acima vêm do cálculo do servidor; a lista abaixo é apenas uma amostra dos lançamentos.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Origem</TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Lançamento</TableHead>
                      <TableHead className="text-xs text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <TableRow key={`${l.origem}-${l.id}`} className={l.estorno ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
                        <TableCell className="text-xs">
                          {l.origem}
                          {l.estorno && <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700">Estorno</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{l.data}</TableCell>
                        <TableCell className="text-xs">{l.categoria} • {l.parceiro} — {l.descricao}</TableCell>
                        <TableCell className={`text-right text-xs ${l.estorno ? "text-amber-700" : ""}`}>{brl(l.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
