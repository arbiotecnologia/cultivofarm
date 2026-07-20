import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/financial/format";
import { Undo2 } from "lucide-react";
import { EstornoDialog } from "./EstornoDialog";
import { EmitirReciboButton } from "./EmitirReciboButton";

interface Props {
  kind: "receivable" | "payable";
  contaId: string | null;
}

export function PagamentosTab({ kind, contaId }: Props) {
  const { role } = useAuth();
  const [estorno, setEstorno] = useState<any | null>(null);
  const canReverse = role === "administrador" || role === "gestor";

  const payTable = kind === "receivable" ? "receivable_payments" : "payable_payments";
  const instTable = kind === "receivable" ? "accounts_receivable_installments" : "accounts_payable_installments";
  const fkParent = kind === "receivable" ? "receivable_id" : "payable_id";
  const amountField = kind === "receivable" ? "amount_received" : "amount_paid";

  const { data: payments = [] } = useQuery({
    queryKey: ["fin-payments", kind, contaId],
    enabled: !!contaId,
    queryFn: async () => {
      // Pega ids das parcelas dessa conta
      const { data: insts } = await supabase.from(instTable as any).select("id").eq(fkParent, contaId!);
      const ids = (insts || []).map((i: any) => i.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from(payTable as any)
        .select("*, payment_methods(name), bank_accounts(name)")
        .in("installment_id", ids)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const reversedIds = new Set(payments.filter((p: any) => p.reversed_payment_id).map((p: any) => p.reversed_payment_id));

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
            {!payments.length && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum lançamento</TableCell></TableRow>
            )}
            {payments.map((p: any) => {
              const wasReversed = reversedIds.has(p.id);
              return (
                <TableRow key={p.id} className={p.is_reversal ? "bg-destructive/5" : ""}>
                  <TableCell>{fmtDate(p.payment_date)}</TableCell>
                  <TableCell className={p.is_reversal ? "text-destructive font-medium" : ""}>{brl(p[amountField])}</TableCell>
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
                      <Button size="sm" variant="ghost" onClick={() => setEstorno(p)} title="Estornar">
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
      <EstornoDialog open={!!estorno} onClose={() => setEstorno(null)} kind={kind} payment={estorno} />
    </>
  );
}
