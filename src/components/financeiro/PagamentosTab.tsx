import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/financial/format";
import { Undo2 } from "lucide-react";
import { EstornoDialog, type FinancialPayment } from "./EstornoDialog";
import { EmitirReciboButton } from "./EmitirReciboButton";

interface Props {
  kind: "receivable" | "payable";
  contaId: string | null;
}

export function PagamentosTab({ kind, contaId }: Props) {
  const { roles, profile, loading, error: authError } = useAuth();
  const fence = useStorageAccessScope(`fin-payments:${kind}:${contaId}`);
  const qc = useQueryClient();
  const [selection, setSelection] = useState<{ payment: FinancialPayment; scope: string } | null>(null);
  const canReverse = fence.ready && roles.some((role) =>
    role === "administrador" || role === "gestor" || role === "financeiro");

  useEffect(() => {
    setSelection(null);
    const predicate = (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === "fin-payments" && query.queryKey[1] === kind &&
      query.queryKey[2] === contaId && query.queryKey.at(-1) !== fence.scope;
    void qc.cancelQueries({ predicate });
    qc.removeQueries({ predicate });
  }, [qc, fence.scope, kind, contaId]);

  const query = useQuery<FinancialPayment[]>({
    queryKey: ["fin-payments", kind, contaId, fence.scope],
    enabled: fence.ready && !!contaId && !authError,
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    placeholderData: undefined,
    queryFn: async ({ signal }) => {
      const current = fence.capture();
      const org = profile?.organization_id;
      const assertCurrent = () => {
        if (!current() || signal.aborted) throw new Error("Sessão alterada. Reabra a conta.");
      };
      assertCurrent();
      if (!contaId || !org) throw new Error("Sessão indisponível.");
      const insts = kind === "receivable"
        ? await supabase.from("accounts_receivable_installments").select("id")
          .eq("receivable_id", contaId).filter("organization_id", "eq", org).abortSignal(signal)
        : await supabase.from("accounts_payable_installments").select("id")
          .eq("payable_id", contaId).filter("organization_id", "eq", org).abortSignal(signal);
      assertCurrent();
      if (insts.error) throw insts.error;
      const ids = (insts.data ?? []).map((inst) => inst.id);
      if (!ids.length) return [];
      const columns = "id,installment_id,organization_id,payment_date,is_reversal,reversed_payment_id,payment_methods(name),bank_accounts(name)";
      const result = kind === "receivable"
        ? await supabase.from("receivable_payments").select(`${columns},amount_received`)
          .filter("organization_id", "eq", org).in("installment_id", ids)
          .order("payment_date", { ascending: false }).abortSignal(signal).returns<FinancialPayment[]>()
        : await supabase.from("payable_payments").select(`${columns},amount_paid`)
          .filter("organization_id", "eq", org).in("installment_id", ids)
          .order("payment_date", { ascending: false }).abortSignal(signal).returns<FinancialPayment[]>();
      assertCurrent();
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  const payments = fence.ready && !authError && !query.isError ? query.data ?? [] : [];
  const reversedIds = new Set(payments.filter((p) => p.reversed_payment_id).map((p) => p.reversed_payment_id));
  const estorno = selection?.scope === fence.scope && canReverse
    ? payments.find((p) => p.id === selection.payment.id && !p.is_reversal &&
      p.organization_id === profile?.organization_id &&
      !p.reversed_payment_id && !reversedIds.has(p.id)) ?? null : null;
  useEffect(() => {
    if (selection && !estorno) setSelection(null);
  }, [selection, estorno]);
  const waiting = loading || (fence.ready && !!contaId && query.isPending && !authError);

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {waiting && <TableRow><TableCell colSpan={6} role="status">Carregando lançamentos…</TableCell></TableRow>}
            {!waiting && (!fence.ready || authError) && <TableRow><TableCell colSpan={6} role="alert">Sessão indisponível para consultar lançamentos.</TableCell></TableRow>}
            {fence.ready && query.isError && <TableRow><TableCell colSpan={6} role="alert">
              Não foi possível carregar os lançamentos.
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Tentar novamente</Button>
            </TableCell></TableRow>}
            {fence.ready && !authError && query.isSuccess && !payments.length && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum lançamento</TableCell></TableRow>
            )}
            {payments.map((p) => {
              const wasReversed = reversedIds.has(p.id);
              return (
                <TableRow key={p.id} className={p.is_reversal ? "bg-destructive/5" : ""}>
                  <TableCell>{fmtDate(p.payment_date)}</TableCell>
                  <TableCell className={p.is_reversal ? "text-destructive font-medium" : ""}>{brl(kind === "receivable" ? p.amount_received : p.amount_paid)}</TableCell>
                  <TableCell className="text-sm">{p.payment_methods?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{p.bank_accounts?.name ?? "—"}</TableCell>
                  <TableCell>
                    {p.is_reversal ? <Badge variant="destructive">Estorno</Badge>
                      : wasReversed ? <Badge variant="outline">Estornado</Badge>
                      : <Badge variant="secondary">Baixa</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!p.is_reversal && !wasReversed && kind === "receivable" && (
                      <EmitirReciboButton paymentId={p.id} />
                    )}
                    {!p.is_reversal && !wasReversed && canReverse && (
                      <Button size="sm" variant="ghost" disabled={query.isFetching} onClick={() => setSelection({ payment: p, scope: fence.scope })} title="Estornar">
                        <Undo2 className="h-3 w-3 mr-1" />Estornar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <EstornoDialog open={!!estorno} onClose={() => setSelection(null)} kind={kind} payment={estorno} />
    </>
  );
}
