import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, RefreshCw } from "lucide-react";
import { formatDateDisplay as formatDateBR } from "@/lib/date-utils";

type ApprovalStatus = "all" | "not_required" | "pending" | "approved" | "rejected";

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  not_required: { label: "Não exige aprovação", variant: "secondary" },
  pending: { label: "Pendente", variant: "outline" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Reprovado", variant: "destructive" },
};

const formatBRL = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

interface TermRow {
  id: string;
  partner_order_id: string;
  plan_name_snapshot: string;
  plan_code_snapshot: string;
  installment_count: number;
  first_due_date: string;
  table_amount: number;
  discount_amount: number;
  net_amount_after_discount: number;
  final_amount: number;
  approval_status: string;
  created_at: string;
  partner_orders: {
    numero: string;
    status: string;
    partner_id: string;
    partner_accounts: { nome_fantasia: string | null; razao_social: string | null } | null;
  } | null;
  partner_order_payment_schedule: Array<{
    id: string;
    installment_number: number;
    due_date: string;
    amount: number;
    status: string;
    receivable_installment_id: string | null;
  }>;
}

export default function AuditoriaMotorB2B() {
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus>("all");
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["auditoria-motor-b2b", statusFilter, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      let q = supabase
        .from("partner_order_payment_terms")
        .select(
          `id, partner_order_id, plan_name_snapshot, plan_code_snapshot,
           installment_count, first_due_date, table_amount, discount_amount,
           net_amount_after_discount, final_amount, approval_status, created_at,
           partner_orders:partner_order_id (
             numero, status, partner_id,
             partner_accounts:partner_id ( nome_fantasia, razao_social )
           ),
           partner_order_payment_schedule (
             id, installment_number, due_date, amount, status, receivable_installment_id
           )`
        )
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") q = q.eq("approval_status", statusFilter);

      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as TermRow[]) ?? [];
    },
  });

  const filtered = (data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const numero = r.partner_orders?.numero?.toLowerCase() ?? "";
    const parceiro =
      r.partner_orders?.partner_accounts?.nome_fantasia?.toLowerCase() ??
      r.partner_orders?.partner_accounts?.razao_social?.toLowerCase() ??
      "";
    return numero.includes(s) || parceiro.includes(s) || r.plan_code_snapshot.toLowerCase().includes(s);
  });

  const totals = filtered.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.final += Number(r.final_amount);
      if (r.approval_status === "pending") acc.pending += 1;
      if (r.approval_status === "rejected") acc.rejected += 1;
      return acc;
    },
    { count: 0, final: 0, pending: 0, rejected: 0 }
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Auditoria Motor B2B</h1>
          <p className="text-sm text-muted-foreground">
            Snapshots financeiros (<code>partner_order_payment_terms</code>) e parcelas
            programadas (<code>partner_order_payment_schedule</code>) dos pedidos recentes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos no período</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{totals.count}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Valor total (final)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{formatBRL(totals.final)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Aguardando aprovação</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{totals.pending}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reprovados</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{totals.rejected}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="w-56">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApprovalStatus)}>
              <SelectTrigger><SelectValue placeholder="Status de aprovação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="not_required">Não exige aprovação</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="rejected">Reprovado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="180">Últimos 180 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            className="max-w-xs"
            placeholder="Buscar pedido, parceiro ou plano..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Nenhum snapshot encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Pedido</TableHead>
                  <TableHead>Parceiro</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Tabela</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="text-right">Total final</TableHead>
                  <TableHead className="text-center">Parcelas</TableHead>
                  <TableHead>1º venc.</TableHead>
                  <TableHead>Aprovação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const badge = STATUS_LABEL[r.approval_status] ?? STATUS_LABEL.not_required;
                  const parceiro =
                    r.partner_orders?.partner_accounts?.nome_fantasia ??
                    r.partner_orders?.partner_accounts?.razao_social ??
                    "—";
                  return (
                    <Collapsible key={r.id} asChild>
                      <>
                        <TableRow>
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.partner_orders?.numero ?? "—"}</TableCell>
                          <TableCell>{parceiro}</TableCell>
                          <TableCell>
                            <div className="text-sm">{r.plan_name_snapshot}</div>
                            <div className="text-xs text-muted-foreground">{r.plan_code_snapshot}</div>
                          </TableCell>
                          <TableCell className="text-right">{formatBRL(r.table_amount)}</TableCell>
                          <TableCell className="text-right">- {formatBRL(r.discount_amount)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatBRL(r.final_amount)}</TableCell>
                          <TableCell className="text-center">{r.installment_count}</TableCell>
                          <TableCell>{formatDateBR(r.first_due_date)}</TableCell>
                          <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/40">
                            <TableCell colSpan={10}>
                              <div className="p-2">
                                <div className="text-xs font-semibold mb-2">
                                  Parcelas programadas ({r.partner_order_payment_schedule.length})
                                </div>
                                {r.partner_order_payment_schedule.length === 0 ? (
                                  <div className="text-xs text-muted-foreground">Nenhuma parcela gerada.</div>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Vencimento</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>AR vinculado</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {[...r.partner_order_payment_schedule]
                                        .sort((a, b) => a.installment_number - b.installment_number)
                                        .map((p) => (
                                          <TableRow key={p.id}>
                                            <TableCell>{p.installment_number}</TableCell>
                                            <TableCell>{formatDateBR(p.due_date)}</TableCell>
                                            <TableCell className="text-right">{formatBRL(p.amount)}</TableCell>
                                            <TableCell>
                                              <Badge variant={p.status === "generated" ? "default" : p.status === "canceled" ? "destructive" : "outline"}>
                                                {p.status}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                              {p.receivable_installment_id ?? "—"}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
