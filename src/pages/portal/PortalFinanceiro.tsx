import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet } from "lucide-react";
import { brl, fmtDate, STATUS_LABEL } from "@/lib/financial/format";

export default function PortalFinanceiro() {
  const { clienteId, loading } = usePortalCliente();
  const [filtro, setFiltro] = useState("ALL");

  const { data: titulos = [], isLoading } = useScopedPortalQuery({
    queryKey: ["portal-ar", clienteId, filtro],
    enabled: !!clienteId,
    queryFn: async (signal) => {
      let q = supabase.from("accounts_receivable")
        .select("*, accounts_receivable_installments(*)")
        .eq("customer_id", clienteId!)
        .order("first_due_date", { ascending: false }).abortSignal(signal);
      if (filtro !== "ALL") q = q.eq("status", filtro);
      const { data, error } = await q;
      if (error) throw error; return data;
    },
  });

  if (loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  const allInst = titulos.flatMap((t: any) => (t.accounts_receivable_installments || []).map((i: any) => ({ ...i, _titulo: t })));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" />Meus Títulos</h1>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="OPEN">Em aberto</SelectItem>
            <SelectItem value="PARTIAL">Parcial</SelectItem>
            <SelectItem value="OVERDUE">Vencidos</SelectItem>
            <SelectItem value="PAID">Pagos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Parcelas</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead>Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {allInst.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum título disponível</TableCell></TableRow> :
                allInst.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i._titulo.description}</TableCell>
                    <TableCell>{i.installment_number}/{i._titulo.installment_count}</TableCell>
                    <TableCell>{fmtDate(i.due_date)}</TableCell>
                    <TableCell>{brl(i.original_amount)}</TableCell>
                    <TableCell><Badge variant={i.status === "PAID" ? "default" : i.status === "OVERDUE" ? "destructive" : "secondary"}>{STATUS_LABEL[i.status as keyof typeof STATUS_LABEL] || i.status}</Badge></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
