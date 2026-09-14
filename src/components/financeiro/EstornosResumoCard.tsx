import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/financial/format";
import { RefreshCw, Undo2 } from "lucide-react";
import { validarPeriodo } from "@/components/financeiro/bi/PeriodoFilter";

interface Props {
  from: string;
  to: string;
}

export const MSG_ERRO_ESTORNOS = "Não foi possível carregar os estornos do período.";
/** Páginas de leitura: soma completa sem depender do limite padrão da API. */
export const PAGINA_ESTORNOS = 1000;
export const MAX_PAGINAS_ESTORNOS = 20;

type Resumo = { recCount: number; recSum: number; payCount: number; paySum: number; completo: boolean };

async function somarEstornos(
  tabela: "receivable_payments" | "payable_payments",
  coluna: "amount_received" | "amount_paid",
  from: string,
  to: string,
): Promise<{ soma: number; itens: number; completo: boolean }> {
  let soma = 0;
  let itens = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS_ESTORNOS; pagina++) {
    const inicio = pagina * PAGINA_ESTORNOS;
    const { data, error } = await (supabase as any)
      .from(tabela)
      .select(`id, ${coluna}`)
      .eq("is_reversal", true)
      .gte("payment_date", from)
      .lte("payment_date", to)
      .order("id")
      .range(inicio, inicio + PAGINA_ESTORNOS - 1);
    if (error) throw error;
    const linhas = (data || []) as any[];
    soma += linhas.reduce((s, r) => s + Number(r[coluna] || 0), 0);
    itens += linhas.length;
    if (linhas.length < PAGINA_ESTORNOS) return { soma, itens, completo: true };
  }
  // Excedeu o teto de páginas: a soma seria truncada — melhor declarar incompleta.
  return { soma, itens, completo: false };
}

/**
 * Mostra os estornos do período para transparência no DRE e no Fluxo de Caixa.
 * Regra oficial: estornos têm valor negativo e já cancelam o pagamento original
 * na soma realizada — este card apenas explicita o impacto.
 */
export function EstornosResumoCard({ from, to }: Props) {
  const periodoErro = validarPeriodo({ from, to });
  const periodoValido = !periodoErro;

  const { data, isLoading, isError, isFetching, refetch } = useQuery<Resumo>({
    queryKey: ["fin-estornos-resumo", from, to],
    enabled: periodoValido,
    queryFn: async () => {
      const [rec, pay] = await Promise.all([
        somarEstornos("receivable_payments", "amount_received", from, to),
        somarEstornos("payable_payments", "amount_paid", from, to),
      ]);
      return {
        recCount: rec.itens,
        recSum: rec.soma,
        payCount: pay.itens,
        paySum: pay.soma,
        completo: rec.completo && pay.completo,
      };
    },
  });

  if (!periodoValido) return null;

  const atualizando = isFetching && !isLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-3 text-sm text-muted-foreground" role="status">
          Carregando estornos do período…
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-3 flex items-center gap-3 flex-wrap" role="alert">
          <p className="text-sm text-destructive">{MSG_ERRO_ESTORNOS}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const semEstornos = data.recCount === 0 && data.payCount === 0;

  return (
    <Card className={semEstornos ? "" : "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10"}>
      <CardContent className={`p-3 flex items-center gap-4 flex-wrap ${atualizando ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Undo2 className="h-4 w-4 text-amber-600" />
          Estornos no período
        </div>
        {atualizando && <span className="text-xs text-muted-foreground">Atualizando…</span>}

        {semEstornos ? (
          <span className="text-xs text-muted-foreground">Nenhum estorno registrado no período.</span>
        ) : (
          <>
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
          </>
        )}

        {!data.completo && (
          <p className="w-full text-xs text-destructive" role="alert">
            Há mais estornos do que é possível somar com segurança aqui. Os valores acima estão incompletos —
            use o relatório de estornos para o total.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
