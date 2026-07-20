import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductionPlanning } from "@/hooks/useProductionPlanning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateDisplay as fmtDate } from "@/lib/date-utils";
import { brl as fmt } from "@/lib/financial/format";
import { Eye, Factory } from "lucide-react";
import { useB2BSlaConfigMap } from "@/hooks/useB2BSlaConfig";
import { computeSlaBadge } from "@/lib/b2bSla";
import { FaseSlaBadge } from "@/components/comercial/FaseSlaBadge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  aguardando_planejamento: "secondary",
  planejado: "outline",
  em_producao: "default",
  produzido: "default",
  entregue: "default",
  cancelado: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  aguardando_planejamento: "Aguardando",
  planejado: "Planejado",
  em_producao: "Em produção",
  produzido: "Produzido",
  entregue: "Entregue",
  cancelado: "Cancelado",
};



export default function PlanejamentoProducao() {
  const [status, setStatus] = useState<string>("all");
  const { data = [], isLoading } = useProductionPlanning(status);
  const { map: slaConfig } = useB2BSlaConfigMap();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const kpis = {
    aguardando: data.filter((p: any) => p.status === "aguardando_planejamento").length,
    em_producao: data.filter((p: any) => p.status === "em_producao").length,
    produzido: data.filter((p: any) => p.status === "produzido").length,
    entregue: data.filter((p: any) => p.status === "entregue").length,
    atrasados: data.filter(
      (p: any) =>
        p.order_requested_date &&
        p.order_requested_date < today &&
        !["entregue", "cancelado"].includes(p.status),
    ).length,
  };

  const isNovo = (p: any) => {
    if (p.status !== "aguardando_planejamento" || !p.order_approved_at) return false;
    return Date.now() - new Date(p.order_approved_at).getTime() < 24 * 60 * 60 * 1000;
  };
  const isAtrasado = (p: any) =>
    p.order_requested_date &&
    p.order_requested_date < today &&
    !["entregue", "cancelado"].includes(p.status);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6" /> Planejamento de Produção
          </h1>
          <p className="text-sm text-muted-foreground">Pedidos B2B aprovados aguardando ou em produção</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="aguardando_planejamento">Aguardando</SelectItem>
            <SelectItem value="planejado">Planejado</SelectItem>
            <SelectItem value="em_producao">Em produção</SelectItem>
            <SelectItem value="produzido">Produzido</SelectItem>
            <SelectItem value="entregue">Entregue</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Aguardando", value: kpis.aguardando, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
          { label: "Em produção", value: kpis.em_producao, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
          { label: "Produzido", value: kpis.produzido, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
          { label: "Entregue", value: kpis.entregue, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
          { label: "Atrasados", value: kpis.atrasados, tone: "bg-red-500/10 text-red-700 dark:text-red-400" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className={`text-2xl font-bold rounded px-1 inline-block ${k.tone}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Pedidos B2B em planejamento</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum planejamento encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Parceiro</TableHead>
                    <TableHead>Aprovação</TableHead>
                    <TableHead>Data desejada</TableHead>
                    <TableHead>Previsão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((p) => {
                    const slaInfo = computeSlaBadge(p.status, p.updated_at, slaConfig);
                    return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {p.order_numero}
                          {isNovo(p) && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" variant="outline">Novo</Badge>}
                          {isAtrasado(p) && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                          <FaseSlaBadge info={slaInfo} />
                        </div>
                      </TableCell>
                      <TableCell>{p.partner_nome}</TableCell>
                      <TableCell>{p.order_approved_at ? fmtDate(p.order_approved_at) : "—"}</TableCell>
                      <TableCell>{p.order_requested_date ? fmtDate(p.order_requested_date) : "—"}</TableCell>
                      <TableCell>{p.order_estimated_date ? fmtDate(p.order_estimated_date) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmt(p.order_total)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/operacao/planejamento/${p.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Abrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  );})}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
